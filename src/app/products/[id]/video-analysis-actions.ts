"use server";

import { revalidatePath } from "next/cache";
import { generateStructured } from "@/lib/generators";
import { VIDEO_ANALYSIS_SCHEMA } from "@/lib/generation-schemas";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runInBackground } from "@/lib/background";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  extractAudio,
  extractFrames,
  ffmpegReady,
  probe,
  withTempVideo,
} from "@/lib/video/ffmpeg";
import { transcribe } from "@/lib/video/providers";
import {
  buildAnalysisPrompt,
  framePlan,
  reviewAnalysis,
  type VideoAnalysis,
} from "@/lib/video/analysis";
import { deleteVideoReference, saveVideoReference } from "@/lib/data/video-references";
import type { LaunchResult } from "@/types/jobs";

/**
 * Analizar un anuncio en vídeo para poder escribir otro.
 *
 * ## El recorrido
 *
 * El vídeo entra, se sondea, se le sacan veinte fotogramas y el audio, se
 * transcribe la voz y todo eso va a Claude, que describe **cómo está
 * construido**. El vídeo se borra al terminar: lo que se reutiliza es el
 * análisis, no el archivo.
 *
 * ## Por qué se comprueba ffmpeg antes de nada
 *
 * Porque el orden importa para quien lo usa. Descubrir que falta ffmpeg después
 * de que alguien haya subido cien megas por una conexión de casa es la peor
 * versión del mismo error, y el aviso ya trae el comando de instalación.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Los formatos que se aceptan, con su extensión.
 *
 * Se valida el tipo **antes** de tocar el archivo, y la extensión sale de esta
 * tabla y no del nombre que traiga: escribir en disco con la extensión que
 * manda el navegador deja elegir el nombre del archivo a quien sube.
 */
const ACCEPTED = new Map([
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
  ["video/webm", ".webm"],
  ["video/x-m4v", ".m4v"],
  ["video/x-matroska", ".mkv"],
]);

export async function analyzeVideoAction(form: FormData): Promise<LaunchResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  if (!(await ffmpegReady())) {
    throw new Error(
      "ffmpeg no está instalado en el servidor. Entra por SSH y ejecuta: sudo apt install -y ffmpeg",
    );
  }

  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0) throw new Error("Elige un vídeo.");

  const extension = ACCEPTED.get(file.type);
  if (!extension) {
    throw new Error(
      `«${file.type || "desconocido"}» no es un formato de vídeo que se pueda leer. Sirven mp4, mov, webm, m4v y mkv.`,
    );
  }

  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `El vídeo pesa ${(file.size / 1024 / 1024).toFixed(0)} MB y el tope son ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
    );
  }

  const name = readText(form.get("name")) || file.name.replace(/\.[^.]+$/, "");
  const sourceUrl = readText(form.get("sourceUrl"));
  const context = readText(form.get("context"));
  const language = readText(form.get("language"));

  const data = Buffer.from(await file.arrayBuffer());

  return runInBackground({
    kind: "imagenes",
    label: `Analizar anuncio · ${name}`,
    revalidate: "/products",
    work: async () => {
      const { path, cleanup } = await withTempVideo(data, extension);

      try {
        const info = await probe(path);

        if (info.duration > MAX_VIDEO_SECONDS) {
          throw new Error(
            `Dura ${Math.round(info.duration)} s y el tope son ${MAX_VIDEO_SECONDS}. Recorta el anuncio a lo que quieras analizar.`,
          );
        }

        const marks = framePlan(info.duration);
        const frames = await extractFrames(path, marks);

        /*
         * La transcripción no puede tumbar el análisis.
         *
         * Un anuncio de solo texto en pantalla es un formato normal, y la voz es
         * la mitad de la información, no toda: los fotogramas cuentan la otra.
         */
        let transcript = "";
        if (info.hasAudio) {
          const audio = await extractAudio(path);
          if (audio) transcript = await transcribe(audio, language || undefined).catch(() => "");
        }

        const { data: analysis, inputTokens, outputTokens } =
          await generateStructured<VideoAnalysis>({
            prompt: buildAnalysisPrompt({
              duration: info.duration,
              // Los segundos que se mandan son los de los fotogramas que
              // **salieron**, no los que se pidieron: si alguno falló, decir el
              // segundo equivocado descoloca toda la línea de tiempo.
              marks: marks.slice(0, frames.length),
              transcript,
              context: context || undefined,
            }),
            schema: VIDEO_ANALYSIS_SCHEMA,
            role: "copy",
            maxTokens: 16_000,
            images: frames.map((frame) => ({
              mediaType: "image/jpeg",
              base64: frame.toString("base64"),
            })),
          });

        const review = reviewAnalysis(analysis, info.duration);

        await saveVideoReference({
          name,
          sourceUrl,
          durationSeconds: info.duration,
          width: info.width,
          height: info.height,
          hadAudio: info.hasAudio,
          framesAnalyzed: frames.length,
          analysis,
          warnings: review.warnings,
        });

        return {
          summary: [
            `${frames.length} fotogramas de ${info.duration.toFixed(0)} s`,
            transcript ? " con voz transcrita" : info.hasAudio ? " (no se pudo transcribir)" : " sin voz",
            `. ${analysis.beats.length} momentos, corte cada ${analysis.averageShotSeconds.toFixed(1)} s.`,
            review.warnings.length > 0 ? ` ${review.warnings.length} aviso(s) que mirar.` : "",
          ].join(""),
          inputTokens,
          outputTokens,
        };
      } finally {
        // Siempre. Cada análisis dejaría si no cien megas en un disco pequeño.
        await cleanup();
      }
    },
  });
}

export async function deleteVideoReferenceAction(id: unknown, productId: unknown): Promise<void> {
  const referenceId = readText(id);
  if (!referenceId) return;

  await deleteVideoReference(referenceId);

  const product = readText(productId);
  if (product) revalidatePath(`/products/${product}`);
}
