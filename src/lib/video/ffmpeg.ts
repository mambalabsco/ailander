import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Sacar fotogramas y audio de un vídeo, con ffmpeg del sistema.
 *
 * ## Por qué local y no en una API
 *
 * El montaje final sí va a fal, porque componer pistas con música y subtítulos
 * es caro de CPU y se paga una vez por vídeo. Esto es lo contrario: sacar veinte
 * fotogramas de un mp4 es casi gratis en cualquier máquina, y mandarlo fuera
 * añadiría una subida, una espera y una factura por cada anuncio que se mire.
 *
 * ## Los límites, y por qué existen
 *
 * El servidor tiene dos núcleos y cuatro gigas. Un anuncio de respuesta directa
 * dura entre quince segundos y tres minutos, así que el tope de duración no
 * estorba a nada real y evita que alguien suelte una película y deje la máquina
 * ocupada media hora. El de tamaño es lo mismo por el otro lado.
 *
 * Cada llamada tiene su plazo. Sin él, un archivo corrupto deja un proceso
 * colgado para siempre y el siguiente análisis se encuentra la máquina llena.
 */

/**
 * Lo que se acepta analizar. Un anuncio real entra de sobra.
 *
 * Sesenta y cuatro megas cubren un anuncio de dos minutos en 1080p con holgura.
 * El tope no es de disco sino de memoria: Next monta el cuerpo de la subida
 * entero en RAM y el servidor tiene cuatro gigas. Tiene que ir a la par con
 * `serverActions.bodySizeLimit` en `next.config.ts` — si aquí fuera mayor, la
 * subida moriría antes de llegar a esta comprobación y el mensaje de error no
 * diría nada útil.
 */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 600;

const PROBE_TIMEOUT = 30_000;
const FRAME_TIMEOUT = 120_000;
const AUDIO_TIMEOUT = 180_000;

export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/**
 * Si ffmpeg está instalado.
 *
 * Se comprueba **antes** de subir nada. Descubrirlo después de que alguien haya
 * subido cien megas es la peor versión posible del mismo error.
 */
export async function ffmpegReady(): Promise<boolean> {
  try {
    await run("ffprobe", ["-version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (/ENOENT/.test(message)) {
    throw new Error(
      "ffmpeg no está instalado en el servidor. Instálalo con: sudo apt install -y ffmpeg",
    );
  }

  if (/timed out|ETIMEDOUT/i.test(message)) {
    throw new Error("El vídeo tardó demasiado en procesarse. Prueba con uno más corto.");
  }

  throw new Error(`ffmpeg falló: ${message.split("\n")[0]}`);
}

/** Duración, tamaño y si trae audio. */
export async function probe(path: string): Promise<VideoProbe> {
  try {
    const { stdout } = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        path,
      ],
      { timeout: PROBE_TIMEOUT, maxBuffer: 4 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; width?: number; height?: number }[];
    };

    const streams = data.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === "video");

    const duration = Number(data.format?.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("no se pudo leer la duración; puede que no sea un vídeo");
    }

    return {
      duration,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    };
  } catch (error) {
    fail(error);
  }
}

/**
 * Un fotograma por cada segundo pedido, en JPEG.
 *
 * Se saca **uno por llamada** con `-ss` antes de `-i`, que es la forma rápida:
 * ffmpeg salta directo al punto en vez de decodificar desde el principio. Con un
 * solo filtro para los veinte habría que decodificar el vídeo entero.
 *
 * Se escala a 768 de ancho. Es lo que Claude usa para mirar una imagen, así que
 * mandar más resolución cuesta lo mismo en tokens y solo añade subida.
 */
export async function extractFrames(path: string, marks: number[]): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), "vframes-"));

  try {
    const frames: Buffer[] = [];

    for (const [index, mark] of marks.entries()) {
      const out = join(dir, `f${index}.jpg`);

      try {
        await run(
          "ffmpeg",
          [
            "-ss",
            mark.toFixed(2),
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            "scale=768:-2",
            "-q:v",
            "4",
            "-y",
            out,
          ],
          { timeout: FRAME_TIMEOUT, maxBuffer: 1024 * 1024 },
        );

        frames.push(await readFile(out));
      } catch {
        /*
         * Un fotograma que no sale no tumba el análisis.
         *
         * Pasa de verdad cerca del final y en vídeos con el índice roto. Con
         * diecinueve fotogramas se entiende igual el anuncio; sin análisis, no
         * se entiende nada.
         */
        continue;
      }
    }

    if (frames.length === 0) fail(new Error("no se pudo extraer ningún fotograma"));

    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * El audio, en un mp3 pequeño para transcribir.
 *
 * Mono y a 32 kbps: es voz, no música, y la transcripción no mejora con más.
 * Un anuncio de un minuto queda en unos 250 kB, que sube en un parpadeo.
 */
export async function extractAudio(path: string): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "vaudio-"));
  const out = join(dir, "audio.mp3");

  try {
    await run(
      "ffmpeg",
      ["-i", path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-y", out],
      { timeout: AUDIO_TIMEOUT, maxBuffer: 1024 * 1024 },
    );

    return await readFile(out);
  } catch {
    // Un vídeo sin pista de audio es normal en anuncios de solo texto. Se
    // analiza igual y el análisis lo dice.
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Deja el vídeo en un archivo temporal para poder trabajarlo.
 *
 * Devuelve también la función de limpieza, y **hay que llamarla siempre**: cada
 * análisis deja si no cien megas en el disco de un servidor que tiene poco.
 */
export async function withTempVideo(
  data: Buffer,
  extension: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "video-"));
  const path = join(dir, `source${extension.startsWith(".") ? extension : `.${extension}`}`);

  await writeFile(path, data);

  return {
    path,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
