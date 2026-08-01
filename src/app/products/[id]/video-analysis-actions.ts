"use server";

import { revalidatePath } from "next/cache";
import { generateStructured } from "@/lib/generators";
import { VIDEO_ANALYSIS_SCHEMA } from "@/lib/generation-schemas";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runInBackground } from "@/lib/background";
import { transcribe } from "@/lib/video/providers";
import {
  MAX_FRAMES,
  buildAnalysisPrompt,
  reviewAnalysis,
  type VideoAnalysis,
} from "@/lib/video/analysis";
import { deleteVideoReference, saveVideoReference } from "@/lib/data/video-references";
import type { LaunchResult } from "@/types/jobs";

/**
 * Analizar un anuncio en vídeo para poder escribir otro.
 *
 * ## El vídeo no llega hasta aquí
 *
 * Los fotogramas y el audio se sacan **en el navegador**, que ya sabe
 * decodificar vídeo. Aquí llegan veinte JPEG y un WAV pequeño —unos cuatro
 * megas— en vez de un archivo de sesenta.
 *
 * Eso quita el ffmpeg del servidor, quita la espera de subir el vídeo entero por
 * una conexión de casa, y quita los dos núcleos ocupados decodificando mientras
 * alguien más usa la plataforma. La alternativa por API tampoco servía: para
 * esto fal solo ofrece el primer fotograma, el del medio y el último, y con tres
 * no se lee un gancho.
 *
 * ## Lo que sí se comprueba aquí
 *
 * Todo lo que decida algo. Que los fotogramas sean imágenes, que no vengan más
 * de los que se piden, y que los segundos que dice el navegador cuadren con los
 * fotogramas que mandó: si no cuadraran, cada momento del análisis quedaría
 * situado en el segundo equivocado. El navegador es de quien sube, así que lo
 * que dice se valida, no se cree.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Tres megas por fotograma sobra: uno de 768 px pesa unos cien kilobytes. */
const MAX_FRAME_BYTES = 3 * 1024 * 1024;

/** Un anuncio de dos minutos en WAV mono de 16 kHz ronda los cuatro megas. */
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export async function analyzeVideoAction(form: FormData): Promise<LaunchResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const files = form.getAll("frames").filter((item): item is File => item instanceof File);
  if (files.length === 0) throw new Error("No llegó ningún fotograma.");
  if (files.length > MAX_FRAMES) throw new Error("Llegaron más fotogramas de los que se piden.");

  for (const frame of files) {
    if (!frame.type.startsWith("image/")) throw new Error("Uno de los fotogramas no es una imagen.");
    if (frame.size > MAX_FRAME_BYTES) throw new Error("Un fotograma pesa demasiado.");
  }

  const duration = Number(form.get("duration"));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("No se pudo leer la duración del vídeo.");
  }

  let marks: number[];
  try {
    const parsed: unknown = JSON.parse(readText(form.get("marks")) || "[]");
    marks = Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    marks = [];
  }

  /*
   * Los segundos tienen que cuadrar con los fotogramas.
   *
   * Si vinieran descuadrados, cada momento del análisis quedaría situado en el
   * segundo equivocado y la línea de tiempo entera sería falsa — sin que nada
   * fallara de forma visible.
   */
  if (marks.length !== files.length) {
    throw new Error("Los fotogramas y sus tiempos no cuadran. Vuelve a intentarlo.");
  }
  if (marks.some((mark) => mark < 0 || mark > duration + 1)) {
    throw new Error("Algún fotograma dice venir de fuera del vídeo.");
  }

  /*
   * El producto al que pertenece, que faltaba.
   *
   * Sin él, el trabajo se creaba sin dueño y **no aparecía en el panel**: el
   * panel de un producto lista por producto. Así que el análisis corría de
   * verdad en segundo plano pero no había forma de ver por dónde iba ni de
   * cancelarlo, que se lee como que no funciona.
   */
  const productId = readText(form.get("productId"));

  const name = readText(form.get("name")) || "Anuncio sin nombre";
  const sourceUrl = readText(form.get("sourceUrl"));
  const context = readText(form.get("context"));
  const language = readText(form.get("language"));
  const width = Number(form.get("width")) || 0;
  const height = Number(form.get("height")) || 0;

  const audioFile = form.get("audio");
  const audio =
    audioFile instanceof File && audioFile.size > 0 && audioFile.size <= MAX_AUDIO_BYTES
      ? Buffer.from(await audioFile.arrayBuffer())
      : null;

  const frames = await Promise.all(
    files.map(async (frame) => ({
      mediaType: frame.type,
      base64: Buffer.from(await frame.arrayBuffer()).toString("base64"),
    })),
  );

  return runInBackground({
    productId: productId || null,
    kind: "imagenes",
    label: `Analizar anuncio · ${name}`,
    revalidate: productId ? `/products/${productId}` : "/products",
    work: async (report, cancelled) => {
      await report("Transcribiendo la voz");
      /*
       * La transcripción no puede tumbar el análisis.
       *
       * Un anuncio de solo texto en pantalla es un formato normal, y la voz es
       * la mitad de la información, no toda: los fotogramas cuentan la otra.
       */
      const transcript = audio
        ? await transcribe(audio, language || undefined).catch(() => "")
        : "";

      if (await cancelled()) {
        return { summary: "Cancelado antes de analizar. No se ha gastado casi nada." };
      }

      await report(`Mirando ${frames.length} fotogramas`);

      const { data: analysis, inputTokens, outputTokens } = await generateStructured<VideoAnalysis>({
        prompt: buildAnalysisPrompt({
          duration,
          marks,
          transcript,
          context: context || undefined,
        }),
        schema: VIDEO_ANALYSIS_SCHEMA,
        role: "copy",
        maxTokens: 16_000,
        images: frames,
      });

      await report("Guardando el análisis");

      const review = reviewAnalysis(analysis, duration);

      await saveVideoReference({
        name,
        sourceUrl,
        durationSeconds: duration,
        width,
        height,
        hadAudio: Boolean(audio),
        framesAnalyzed: frames.length,
        analysis,
        warnings: review.warnings,
      });

      return {
        summary: [
          `${frames.length} fotogramas de ${duration.toFixed(0)} s`,
          transcript ? " con voz transcrita" : audio ? " (no se pudo transcribir)" : " sin voz",
          `. ${analysis.beats.length} momentos, corte cada ${analysis.averageShotSeconds.toFixed(1)} s.`,
          review.warnings.length > 0 ? ` ${review.warnings.length} aviso(s) que mirar.` : "",
        ].join(""),
        inputTokens,
        outputTokens,
      };
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
