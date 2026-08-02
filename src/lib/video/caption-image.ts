import "server-only";

import sharp from "sharp";

import { captionPieces, captionSvg } from "@/lib/video/captions";
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
 * Un trozo que no se pueda dibujar o subir se salta: quedarse sin un subtítulo
 * es un vídeo con una línea menos, y quedarse sin vídeo por eso sería absurdo.
 */
export async function drawCaptions(
  videoId: string,
  shots: CaptionShot[],
): Promise<DrawnCaption[]> {
  const drawn: DrawnCaption[] = [];

  for (const shot of shots) {
    if (shot.cutStart === null || shot.cutEnd === null) continue;

    // El escrito manda sobre el hablado: es para lo que existe `sub`.
    const written = shot.sub?.trim() || shot.guion;

    const pieces = captionPieces({ written, start: shot.cutStart, end: shot.cutEnd });

    for (const [index, piece] of pieces.entries()) {
      try {
        const png = await sharp(
          Buffer.from(captionSvg({ text: piece.text, width: WIDTH, height: HEIGHT })),
        )
          .png()
          .toBuffer();

        const url = await uploadVideoAsset({
          videoId,
          name: `sub-${shot.n}-${index}.png`,
          data: png,
          contentType: "image/png",
        });

        drawn.push({ url, start: piece.start, end: piece.end });
      } catch {
        continue;
      }
    }
  }

  return drawn;
}
