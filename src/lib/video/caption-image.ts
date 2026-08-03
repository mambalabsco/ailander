import "server-only";

import sharp from "sharp";

import { captionFrames, captionPieces, captionSvg } from "@/lib/video/captions";
import { uploadVideoAsset } from "@/lib/data/video-assets";

/**
 * Dibuja los subtítulos y los deja donde el montaje pueda descargarlos.
 *
 * El reparto en trozos y el dibujo del SVG viven en `captions.ts`, que es puro y
 * está probado. Aquí solo queda lo que necesita el rasterizador y la subida.
 *
 * ## Por qué se dibujan y no se piden a un servicio
 *
 * Hay servicios que ponen subtítulos escuchando el vídeo, y aquí serían un
 * error: el guion va escrito **fonético** para que la voz lo pronuncie bien —«eme
 * ce te» por «MCT»— y quien escuche eso escribirá lo que oye. Como los tiempos
 * por palabra ya los tenemos, se escribe el texto correcto en el segundo
 * correcto sin escuchar nada.
 */

/** El tamaño del entregable: vertical 720×1280. */
const WIDTH = 720;
const HEIGHT = 1280;

export interface CaptionShot {
  n: string;
  /** Lo que se narra, en fonético. */
  guion: string;
  /** Cómo se escribe, cuando difiere. Es el que manda. */
  sub?: string;
  cutStart: number | null;
  cutEnd: number | null;
}

export interface DrawnCaption {
  url: string;
  start: number;
  end: number;
}

/**
 * Un PNG por trozo de subtítulo, subido y con su tiempo.
 *
 * Un trozo que no se pueda dibujar o subir se salta —quedarse sin vídeo por un
 * subtítulo sería absurdo— pero se cuenta y se devuelve el motivo del primero.
 * Saltárselo en silencio es lo que hizo que un vídeo saliera sin ni un subtítulo
 * sin que nada lo dijera.
 */
/**
 * Cuántos fotogramas de subtítulo se dibujan como mucho.
 *
 * Uno por palabra son unos ciento cincuenta en un anuncio de sesenta segundos, y
 * cada uno es un dibujo y una subida. Trescientos cubren dos minutos largos; más
 * allá el montaje tarda más en juntarlos que en montar el vídeo.
 */
const MAX_FRAMES = 300;

export async function drawCaptions(
  videoId: string,
  shots: CaptionShot[],
  report?: (progress: string) => Promise<void>,
): Promise<{ drawn: DrawnCaption[]; failed: number; reason: string }> {
  const drawn: DrawnCaption[] = [];
  let failed = 0;
  let reason = "";

  for (const shot of shots) {
    if (shot.cutStart === null || shot.cutEnd === null) continue;

    // El escrito manda sobre el hablado: es para lo que existe `sub`.
    const written = shot.sub?.trim() || shot.guion;

    const pieces = captionPieces({ written, start: shot.cutStart, end: shot.cutEnd });

    /*
     * Un fotograma por palabra, no por trozo.
     *
     * Es lo que hace que el subtítulo acompañe en vez de estar ahí: se pinta el
     * trozo entero y se enciende la palabra que suena, así que la vista va sola
     * detrás de la que cambia.
     */
    const frames = pieces.flatMap((piece) => captionFrames(piece));

    for (const [index, frame] of frames.entries()) {
      if (drawn.length >= MAX_FRAMES) break;

      // Cada veinte, que si no el cartel cambia cien veces y no se lee ninguna.
      if (report && drawn.length % 20 === 0) {
        await report(`Dibujando subtítulos… ${drawn.length}`);
      }

      try {
        const png = await sharp(
          Buffer.from(
            captionSvg({
              words: frame.words,
              active: frame.active,
              width: WIDTH,
              height: HEIGHT,
            }),
          ),
        )
          .png()
          .toBuffer();

        const url = await uploadVideoAsset({
          videoId,
          name: `sub-${shot.n}-${String(index).padStart(3, "0")}.png`,
          data: png,
          contentType: "image/png",
        });

        drawn.push({ url, start: frame.start, end: frame.end });
      } catch (error) {
        /*
         * Un subtítulo que no sale no tumba el montaje, pero **se cuenta**.
         *
         * Tragarse el fallo sin más fue lo que convirtió un problema de una
         * línea —el almacén no aceptaba imágenes— en un vídeo entero sin
         * subtítulos y sin nada que lo explicara.
         */
        failed += 1;
        if (!reason) reason = error instanceof Error ? error.message : "no se pudo dibujar";
      }
    }
  }

  return { drawn, failed, reason };
}
