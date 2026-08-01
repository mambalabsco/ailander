"use server";

import { revalidatePath } from "next/cache";
import { runInBackground } from "@/lib/background";
import { generateStructured } from "@/lib/generators";
import { SCRIPT_SCHEMA, STYLE_SCHEMA } from "@/lib/generation-schemas";
import { findProductAnywhere } from "@/lib/products";
import { readCopies } from "@/lib/data/copy";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  createVideo,
  deleteVideo,
  listVideos,
  readVideo,
  updateShot,
  updateVideo,
} from "@/lib/data/videos";
import { buildScriptPrompt, buildStylePrompt } from "@/lib/video/script-prompt";
import {
  DEFAULT_RATES,
  NEGATIVE_PROMPT,
  deriveCuts,
  keyframePrompt,
  motionPrompt,
  planDurations,
  reviewShots,
  type Shot,
  type ShotRole,
} from "@/lib/video/shots";
import { buildTimeline } from "@/lib/video/timeline";
import { animate, compose, keyframe, listVoices, speak } from "@/lib/video/providers";
import { uploadVideoAsset } from "@/lib/data/video-assets";
import type { LaunchResult } from "@/types/jobs";

/**
 * El pipeline de vídeo, paso a paso.
 *
 * Cada paso es su propia acción y guarda su resultado. Es deliberado: los pasos
 * cuestan muy distinto —el guion es gratis, la voz céntimos, la animación casi
 * todo— y encadenarlos en una sola acción haría que un fallo en el último
 * obligara a pagar otra vez los anteriores.
 *
 * También permite lo que manda el manual del pipeline: **mirar los keyframes
 * antes de animar**. Regenerar uno malo cuesta dos céntimos; dejarlo pasar
 * cuesta la toma entera.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function guard() {
  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }
}

/* ------------------------------- Las voces --------------------------------- */

/**
 * Las voces de la cuenta, para elegir en un desplegable.
 *
 * Se leen del proveedor en vez de pedir que se pegue un identificador. Uno
 * copiado a mano es un campo más donde equivocarse, y el error no se ve hasta
 * oír el resultado, con la generación ya pagada.
 */
export async function listVoicesAction(): Promise<{
  ok: boolean;
  voices?: { id: string; name: string; labels: string[]; previewUrl?: string }[];
  message?: string;
}> {
  try {
    return { ok: true, voices: await listVoices() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo consultar." };
  }
}

/* ------------------------------- 1 · Guion --------------------------------- */

export async function createVideoFromCopyAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const copyId = readText(raw.copyId);
  const voiceId = readText(raw.voiceId);

  if (!productId || !copyId) throw new Error("Falta el copy.");
  if (!voiceId) throw new Error("Elige una voz.");
  await guard();

  const [product, copies] = await Promise.all([
    findProductAnywhere(productId),
    readCopies(productId),
  ]);

  if (!product) throw new Error("No se encontró el producto.");

  const copy = copies.find((item) => item.id === copyId);
  if (!copy) throw new Error("Ese copy ya no existe.");

  const shots = Math.min(Math.max(Number(raw.shots) || 6, 3), 12);
  const seconds = Math.min(Math.max(Number(raw.seconds) || 60, 15), 180);

  /*
   * El guion puede seguir la construcción de un anuncio ya analizado.
   *
   * Es lo que convierte el análisis en algo útil: sin esto, saber que un anuncio
   * entra por el síntoma y corta cada dos segundos se queda en una ficha bonita
   * que nadie usa al escribir el siguiente.
   */
  const referenceId = readText(raw.referenceId);
  let reference: string | undefined;

  if (referenceId) {
    const { listVideoReferences } = await import("@/lib/data/video-references");
    const { asScriptReference } = await import("@/lib/video/analysis");

    const found = (await listVideoReferences()).find((item) => item.id === referenceId);
    if (!found) throw new Error("Ese anuncio analizado ya no existe.");

    reference = asScriptReference(found.analysis, found.name);
  }

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Guion de vídeo · ${copy.driverLabel}`,
    work: async () => {
      const audience = product.targetAudience || "el público objetivo";
      const country = product.country || "México";

      /*
       * El estilo se pide **antes** que el guion y por separado.
       *
       * Va idéntico en todas las tomas y es lo único que hace que las imágenes
       * generadas por separado parezcan del mismo vídeo. Pidiéndolo dentro de
       * cada toma, el modelo lo variaría un poco cada vez.
       */
      const style = await generateStructured<{ render: string; accent: string }>({
        prompt: buildStylePrompt({ productName: product.name, audience, country }),
        schema: STYLE_SCHEMA,
        role: "copy",
        maxTokens: 2_000,
      });

      const script = await generateStructured<{
        title: string;
        shots: {
          n: string;
          guion: string;
          sub?: string;
          role: string;
          scene: string;
          motion: string;
          speaking: boolean;
        }[];
      }>({
        prompt: buildScriptPrompt({
          productName: product.name,
          audience,
          country,
          body: copy.content.primaryText,
          shots,
          seconds,
          reference,
        }),
        schema: SCRIPT_SCHEMA,
        role: "copy",
        maxTokens: 16_000,
      });

      const parsed: Shot[] = (script.data.shots ?? []).map((shot, index) => ({
        n: shot.n || String(index + 1).padStart(2, "0"),
        guion: shot.guion,
        sub: shot.sub || undefined,
        role: (shot.role as ShotRole) ?? "story",
        scene: shot.scene,
        motion: shot.motion,
        speaking: Boolean(shot.speaking),
      }));

      if (parsed.length === 0) throw new Error("El guion salió vacío.");

      const videoId = await createVideo({
        productId,
        copyId,
        title: script.data.title || copy.driverLabel,
        styleRender: style.data.render,
        styleAccent: style.data.accent,
        voiceId,
        shots: parsed,
      });

      /*
       * Los avisos se cuentan en el resumen pero **no bloquean**.
       *
       * El guion se puede corregir a mano antes de gastar en voz o en imágenes,
       * y ese es justo el momento de verlos. Bloquear aquí obligaría a
       * regenerarlo entero por un `sub` que falta.
       */
      const problems = reviewShots(parsed);

      return {
        summary:
          problems.length > 0
            ? `${parsed.length} tomas. ${problems.length} aviso(s) que revisar antes de gastar.`
            : `${parsed.length} tomas, sin avisos.`,
        result: { videoId },
        inputTokens: style.inputTokens + script.inputTokens,
        outputTokens: style.outputTokens + script.outputTokens,
      };
    },
  });
}

/* -------------------------- 2 · Voz y los cortes --------------------------- */

/**
 * Genera la voz y deriva los cortes reales.
 *
 * Toma por toma y no el guion entero: con textos largos el modelo rápido repite
 * frases, que es un fallo conocido del proveedor. Después se concatena el texto
 * y se piden los tiempos del conjunto, que es lo que alinea todo.
 *
 * **Este paso es el que fija el tiempo de todo el vídeo.** A partir de aquí cada
 * toma dura exactamente lo que dura su frase narrada.
 */
export async function generateVoiceAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  if (!videoId || !productId) throw new Error("Falta el vídeo.");
  await guard();

  const video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");
  if (video.shots.length === 0) throw new Error("El vídeo no tiene tomas.");

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Voz · ${video.title}`,
    work: async () => {
      const text = video.shots.map((shot) => shot.guion).join(" ");

      const voice = await speak({ text, voiceId: video.voiceId });

      const audioUrl = await uploadVideoAsset({
        videoId,
        name: "voz.mp3",
        data: voice.audio,
        contentType: "audio/mpeg",
      });

      const { cuts, missing } = deriveCuts(video.shots, voice.words);

      for (const cut of cuts) {
        const shot = video.shots.find((item) => item.n === cut.n);
        if (shot) await updateShot(shot.id, { cutStart: cut.start, cutEnd: cut.end });
      }

      await updateVideo(videoId, {
        status: "voz",
        voiceUrl: audioUrl,
        words: voice.words,
        voiceSeconds: voice.seconds,
        addSpent: text.length * DEFAULT_RATES.voicePerChar,
      });

      const plans = planDurations(cuts);
      const toSplit = plans.filter((plan) => plan.split);

      return {
        summary: [
          `${voice.seconds.toFixed(1)} s de voz, ${cuts.length} cortes.`,
          missing.length > 0
            ? `${missing.length} toma(s) sin encontrar en el audio (${missing.join(", ")}): revisa su texto.`
            : "",
          toSplit.length > 0
            ? `${toSplit.length} toma(s) pasan de diez segundos y habría que partirlas.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    },
  });
}

/* ----------------------------- 3 · Keyframes ------------------------------- */

/**
 * Las imágenes fijas de las que sale cada toma.
 *
 * Se generan **antes** de animar y se enseñan para revisarlas, que es la mejor
 * relación coste/beneficio de todo el pipeline: regenerar un keyframe cuesta dos
 * céntimos, animar uno malo cuesta la toma entera más el retrabajo.
 *
 * La toma de producto lleva la foto real como referencia. El envase nunca se
 * inventa: uno generado se nota y quema la marca.
 */
export async function generateKeyframesAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  const only = Array.isArray(raw.only) ? raw.only.map((item) => readText(item)) : [];

  if (!videoId || !productId) throw new Error("Falta el vídeo.");
  await guard();

  const video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");

  // Sin `only`, solo las que faltan: repetir las hechas es gastar dos veces.
  const pending = video.shots.filter((shot) =>
    only.length > 0 ? only.includes(shot.n) : !shot.keyframeUrl,
  );

  if (pending.length === 0) {
    return { started: false, message: "Todas las tomas ya tienen su imagen." };
  }

  const { readProductImages } = await import("@/lib/image-store");
  const images = await readProductImages(productId);
  const productShot = images.find((image) => image.isPrimary) ?? images[0];

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Keyframes · ${video.title}`,
    work: async () => {
      let done = 0;
      const failures: string[] = [];

      for (const shot of pending) {
        try {
          const url = await keyframe({
            prompt: keyframePrompt(shot, {
              render: video.styleRender,
              accent: video.styleAccent,
            }),
            // Solo la toma de producto lleva la foto real: en las demás, una
            // referencia del envase mete el frasco donde no pinta nada.
            references: shot.role === "producto" && productShot ? [productShot.url] : [],
          });

          await updateShot(shot.id, { keyframeUrl: url, error: null });
          done += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "falló";
          await updateShot(shot.id, { error: reason });
          failures.push(`${shot.n}: ${reason}`);
        }
      }

      await updateVideo(videoId, {
        status: failures.length === pending.length ? "error" : "keyframes",
        addSpent: done * DEFAULT_RATES.keyframe,
      });

      return {
        summary:
          failures.length > 0
            ? `${done} imagen(es) listas, ${failures.length} fallaron. ${failures[0]}`
            : `${done} imagen(es) listas. Míralas antes de animar.`,
      };
    },
  });
}

/* ------------------------------- 4 · Clips --------------------------------- */

/**
 * Anima los keyframes. **Es donde se va casi todo el dinero.**
 *
 * De una en una y no en paralelo: el proveedor cobra por segundo generado y un
 * lote lanzado a la vez se cobra entero aunque falle a mitad. En serie, un fallo
 * detiene el gasto en la toma que falló.
 */
export async function generateClipsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  const only = Array.isArray(raw.only) ? raw.only.map((item) => readText(item)) : [];

  if (!videoId || !productId) throw new Error("Falta el vídeo.");
  await guard();

  const video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");

  const ready = video.shots.filter(
    (shot) => shot.keyframeUrl && shot.cutStart !== null && shot.cutEnd !== null,
  );

  if (ready.length === 0) {
    return {
      started: false,
      message:
        "Ninguna toma tiene imagen y corte. Genera la voz y los keyframes antes de animar.",
    };
  }

  const pending = ready.filter((shot) => (only.length > 0 ? only.includes(shot.n) : !shot.clipUrl));
  if (pending.length === 0) {
    return { started: false, message: "Todas las tomas ya tienen su clip." };
  }

  const plans = planDurations(
    pending.map((shot) => ({
      n: shot.n,
      start: shot.cutStart ?? 0,
      end: shot.cutEnd ?? 0,
      guion: shot.guion,
    })),
  );

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Clips · ${video.title}`,
    work: async () => {
      let done = 0;
      let seconds = 0;
      const failures: string[] = [];

      for (const shot of pending) {
        const plan = plans.find((item) => item.n === shot.n);
        if (!plan) continue;

        try {
          const url = await animate({
            imageUrl: shot.keyframeUrl!,
            prompt: motionPrompt(shot),
            seconds: plan.request,
            negativePrompt: NEGATIVE_PROMPT,
          });

          await updateShot(shot.id, { clipUrl: url, error: null });
          done += 1;
          seconds += plan.request;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "falló";
          await updateShot(shot.id, { error: reason });
          failures.push(`${shot.n}: ${reason}`);
        }
      }

      await updateVideo(videoId, {
        status: failures.length === pending.length ? "error" : "clips",
        addSpent: seconds * DEFAULT_RATES.videoPerSecond,
      });

      return {
        summary:
          failures.length > 0
            ? `${done} clip(s) listos, ${failures.length} fallaron. ${failures[0]}`
            : `${done} clip(s) listos, ${seconds} s generados.`,
      };
    },
  });
}

/* ------------------------------ 5 · Montaje -------------------------------- */

/**
 * Monta el vídeo final.
 *
 * Fuera del servidor a propósito: el quemado tarda unos cincuenta segundos por
 * minuto de vídeo en dieciséis núcleos, y este servidor tiene dos. Aquí la
 * plataforma solo espera.
 */
export async function assembleVideoAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  if (!videoId || !productId) throw new Error("Falta el vídeo.");

  const video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");
  if (!video.voiceUrl) throw new Error("Falta la voz: sin ella no hay tiempos que montar.");

  const withClip = video.shots.filter((shot) => shot.clipUrl || shot.lipsyncUrl);
  if (withClip.length === 0) throw new Error("No hay ningún clip que montar.");

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Montaje · ${video.title}`,
    work: async () => {
      const timeline = buildTimeline({
        cuts: video.shots
          .filter((shot) => shot.cutStart !== null && shot.cutEnd !== null)
          .map((shot) => ({ n: shot.n, start: shot.cutStart!, end: shot.cutEnd! })),
        clips: Object.fromEntries(
          video.shots
            // El de lipsync gana al mudo cuando existe: es el mismo plano con la
            // boca sincronizada.
            .map((shot) => [shot.n, shot.lipsyncUrl ?? shot.clipUrl])
            .filter((entry): entry is [string, string] => Boolean(entry[1])),
        ),
        voiceUrl: video.voiceUrl!,
      });

      const result = await compose(timeline.tracks);

      await updateVideo(videoId, {
        status: "montado",
        finalUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
      });

      return {
        summary:
          timeline.missing.length > 0
            ? `Montado, ${timeline.seconds} s. Faltaron las tomas ${timeline.missing.join(", ")}: el vídeo salió más corto.`
            : `Montado, ${timeline.seconds} s.`,
      };
    },
  });
}

/* -------------------------------- Gestión ---------------------------------- */

export async function deleteVideoAction(videoId: unknown, productId: unknown): Promise<void> {
  const id = readText(videoId);
  const product = readText(productId);
  if (!id || !product) return;

  await deleteVideo(id);
  revalidatePath(`/products/${product}`);
}

export async function listVideosAction(productId: unknown) {
  const id = readText(productId);
  if (!id || !isSupabaseConfigured()) return [];

  try {
    return await listVideos(id);
  } catch {
    return [];
  }
}
