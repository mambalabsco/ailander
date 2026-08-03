"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/permissions";
import { requireContext } from "@/lib/supabase/session";
import { runInBackground } from "@/lib/background";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  animate,
  burnSubtitles,
  cloneVoice,
  compose,
  keyframe,
  listVoices,
  makeMusic,
  mergeVideos,
  speak,
  trimClip,
} from "@/lib/video/providers";
import { generateWithCli } from "@/lib/higgsfield-cli";
import { attenuateWav, MUSIC_GAIN } from "@/lib/video/wav-gain";
import { findVideoModel, VIDEO_MODELS } from "@/lib/video/shots";
import { move, sorted } from "@/lib/studio-order";
import {
  addAsset,
  createProject,
  deleteAsset,
  deleteProject,
  listAssets,
  updateAsset,
} from "@/lib/data/studio";
import type { LaunchResult } from "@/types/jobs";

/**
 * El estudio: una mesa de trabajo con todos los generadores a mano.
 *
 * ## En qué se diferencia del pipeline de producto
 *
 * Aquel va de un copy a un vídeo terminado, con sus pasos fijos y su orden. Esto
 * es lo contrario: se genera una pieza, se mira, se descarta o se guarda, y el
 * vídeo sale de **ordenar** lo que ha quedado. Los dos hacen falta — uno produce
 * en serie y el otro deja trabajar.
 *
 * ## El permiso
 *
 * Todo lo de aquí exige `estudio`, que tienen el diseñador y quien está por
 * encima. No basta con `gastar`: quien escribe copys no necesita el catálogo
 * entero de modelos delante, y una pantalla con todo dentro invita a probar
 * cosas que cuestan.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function guard() {
  await requireCapability("estudio");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
}

/* ------------------------------- Proyectos --------------------------------- */

export async function createProjectAction(
  name: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();
    await createProject(readText(name), readText(productId));

    revalidatePath("/estudio");
    return { ok: true, message: "Proyecto creado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo crear." };
  }
}

export async function deleteProjectAction(id: unknown): Promise<void> {
  await guard();
  await deleteProject(readText(id));
  revalidatePath("/estudio");
}

/* --------------------------------- Piezas ---------------------------------- */

/**
 * Mueve una pieza en el montaje.
 *
 * Escribe **solo lo que cambia**, que casi siempre es una fila. Renumerar todas
 * en cada arrastre serían treinta escrituras para un gesto que se repite cada
 * pocos segundos.
 */
export async function moveAssetAction(
  projectId: unknown,
  assetId: unknown,
  to: unknown,
): Promise<void> {
  await guard();

  const project = readText(projectId);
  const assets = await listAssets(project);

  const { changes } = move(
    assets.map((asset) => ({ id: asset.id, position: asset.position })),
    readText(assetId),
    Number(to) || 0,
  );

  for (const change of changes) await updateAsset(change.id, { position: change.position });

  revalidatePath("/estudio");
}

/** Deja una pieza fuera del montaje sin borrarla. */
export async function toggleAssetAction(assetId: unknown, included: unknown): Promise<void> {
  await guard();
  await updateAsset(readText(assetId), { included: included === true });
  revalidatePath("/estudio");
}

export async function deleteAssetAction(assetId: unknown): Promise<void> {
  await guard();
  await deleteAsset(readText(assetId));
  revalidatePath("/estudio");
}

/* -------------------------------- Subir algo ------------------------------- */

const KINDS: Record<string, "imagen" | "voz" | "musica" | "clip"> = {
  "image/jpeg": "imagen",
  "image/png": "imagen",
  "image/webp": "imagen",
  "audio/mpeg": "musica",
  "audio/wav": "musica",
  "audio/mp4": "musica",
  "audio/webm": "musica",
  "audio/ogg": "musica",
  "video/mp4": "clip",
  "video/webm": "clip",
};

/** Sube archivos propios al proyecto: fotos, música, clips grabados. */
export async function uploadToStudioAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();

    const projectId = readText(form.get("projectId"));
    if (!projectId) return { ok: false, message: "Falta el proyecto." };

    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length === 0) return { ok: false, message: "No llegó ningún archivo." };

    const { supabase, userId } = await requireContext();
    const rejected: string[] = [];
    let added = 0;

    for (const file of files) {
      const kind = KINDS[file.type];

      if (!kind) {
        rejected.push(`${file.name} (${file.type || "tipo desconocido"})`);
        continue;
      }

      /*
       * El nombre lo pone el servidor.
       *
       * Uno de fuera puede traer barras y acaba siendo una ruta dentro del
       * bucket: dejarlo elegir es dejar escribir fuera de su carpeta.
       */
      const extension = file.type.split("/")[1] ?? "bin";
      const path = `${userId}/${projectId}/${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage
        .from("studio")
        .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });

      if (error) {
        rejected.push(`${file.name} (${error.message})`);
        continue;
      }

      await addAsset({
        projectId,
        kind,
        url: supabase.storage.from("studio").getPublicUrl(path).data.publicUrl,
        name: file.name,
        model: "subido",
      });

      added += 1;
    }

    revalidatePath("/estudio");

    return {
      ok: added > 0,
      message: [
        added > 0 ? `${added} archivo(s) añadidos.` : "No se añadió ninguno.",
        rejected.length > 0 ? ` Fuera: ${rejected.join("; ")}` : "",
      ].join(""),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo subir." };
  }
}

/* ------------------------------- Generadores ------------------------------- */

async function needsKey() {
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }
}

/** Una imagen, con las referencias que se le quieran pasar. */
export async function makeImageAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const prompt = readText(raw.prompt);
  const model = readText(raw.model);
  const aspectRatio = readText(raw.aspectRatio) || "9:16";

  if (!projectId) throw new Error("Falta el proyecto.");
  if (!prompt) throw new Error("Escribe qué quieres ver.");

  await guard();
  await needsKey();

  const references = Array.isArray(raw.references)
    ? raw.references.map(readText).filter(Boolean).slice(0, 7)
    : [];

  return runInBackground({
    kind: "imagenes",
    label: `Imagen · ${prompt.slice(0, 40)}`,
    revalidate: "/estudio",
    resume: { projectId, prompt, model, aspectRatio, references },
    work: async (report) => {
      await report(references.length > 0 ? `Generando con ${references.length} referencia(s)` : "Generando");

      /*
       * Dos vías, y la elección la hace el modelo elegido.
       *
       * Higgsfield acepta las referencias como archivos y hay que bajarlas; kie
       * las quiere como direcciones y las descarga él. Mezclarlas daría un
       * «referencia ignorada» silencioso, que es el peor tipo de fallo aquí:
       * devuelve una imagen bonita que no es la que se pidió.
       */
      let url: string;

      if (model.startsWith("hf:")) {
        const bytes = await Promise.all(
          references.map(async (reference, index) => {
            const response = await fetch(reference, { cache: "no-store" });
            return {
              filename: `ref-${index}.png`,
              bytes: new Uint8Array(await response.arrayBuffer()),
            };
          }),
        );

        const result = await generateWithCli({
          model: model.slice(3),
          prompt,
          aspectRatio,
          references: bytes,
        });

        url = result.imageUrls[0];
        if (!url) throw new Error("No devolvió ninguna imagen.");
      } else {
        url = await keyframe({ prompt, references });
      }

      await addAsset({ projectId, kind: "imagen", url, name: prompt.slice(0, 60), model, prompt });

      return { summary: `Imagen lista con ${model || "el modelo por defecto"}.` };
    },
  });
}

/** Anima una imagen del proyecto. */
export async function makeClipAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const imageUrl = readText(raw.imageUrl);
  const prompt = readText(raw.prompt);
  const modelId = readText(raw.model) || VIDEO_MODELS[0].id;
  const seconds = Number(raw.seconds) || 6;

  if (!projectId || !imageUrl) throw new Error("Elige la imagen que quieres animar.");

  await guard();
  await needsKey();

  const model = findVideoModel(modelId);

  return runInBackground({
    kind: "imagenes",
    label: `Clip · ${model.label}`,
    revalidate: "/estudio",
    resume: { projectId, imageUrl, prompt, model: modelId, seconds },
    work: async (report) => {
      await report(`Animando ${seconds} s con ${model.label}`);

      const url = await animate({
        imageUrl,
        prompt: prompt || "subtle natural motion, camera moves slowly",
        seconds: Math.min(model.maxSeconds, Math.max(1, Math.round(seconds))),
        model: model.slug,
      });

      await addAsset({
        projectId,
        kind: "clip",
        url,
        name: prompt.slice(0, 60) || "Clip",
        model: model.label,
        prompt,
        seconds,
      });

      return { summary: `Clip de ${seconds} s listo. Cuesta ${(seconds * model.usdPerSecond).toFixed(2)} USD.` };
    },
  });
}

/** Una locución con la voz que se elija. */
export async function makeVoiceAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const text = readText(raw.text);
  const voiceId = readText(raw.voiceId);

  if (!projectId || !text) throw new Error("Escribe el texto.");
  if (!voiceId) throw new Error("Elige una voz.");

  await guard();

  return runInBackground({
    kind: "imagenes",
    label: `Voz · ${text.slice(0, 40)}`,
    revalidate: "/estudio",
    resume: { projectId, text, voiceId },
    work: async (report) => {
      await report("Generando la voz");

      const voice = await speak({ text, voiceId });

      const { supabase, userId } = await requireContext();
      const path = `${userId}/${projectId}/${crypto.randomUUID()}.mp3`;

      await supabase.storage
        .from("studio")
        .upload(path, voice.audio, { contentType: "audio/mpeg" });

      await addAsset({
        projectId,
        kind: "voz",
        url: supabase.storage.from("studio").getPublicUrl(path).data.publicUrl,
        name: text.slice(0, 60),
        model: "ElevenLabs",
        prompt: text,
        seconds: voice.seconds,
      });

      return { summary: `${voice.seconds.toFixed(1)} s de voz.` };
    },
  });
}

/** Música a medida, ya baja de volumen para que no tape una locución. */
export async function makeMusicAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const prompt = readText(raw.prompt);
  const seconds = Math.max(10, Math.min(180, Number(raw.seconds) || 30));

  if (!projectId || !prompt) throw new Error("Describe la música que quieres.");

  await guard();

  return runInBackground({
    kind: "imagenes",
    label: `Música · ${prompt.slice(0, 40)}`,
    revalidate: "/estudio",
    resume: { projectId, prompt, seconds },
    work: async (report) => {
      await report(`Componiendo ${seconds} s`);

      const { url } = await makeMusic({ prompt, seconds });

      await report("Bajándole el volumen");

      const response = await fetch(url, { cache: "no-store" });
      const quiet = attenuateWav(new Uint8Array(await response.arrayBuffer()));

      const { supabase, userId } = await requireContext();
      const path = `${userId}/${projectId}/${crypto.randomUUID()}.wav`;

      await supabase.storage
        .from("studio")
        .upload(path, Buffer.from(quiet), { contentType: "audio/wav" });

      await addAsset({
        projectId,
        kind: "musica",
        url: supabase.storage.from("studio").getPublicUrl(path).data.publicUrl,
        name: prompt.slice(0, 60),
        model: "Música",
        prompt,
        seconds,
      });

      return {
        summary: `Cama de ${seconds} s al ${Math.round(MUSIC_GAIN * 100)} % de volumen, para que no tape la voz.`,
      };
    },
  });
}

/** Clona una voz a partir de muestras subidas. */
export async function cloneVoiceAction(form: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();

    const name = readText(form.get("name"));
    if (!name) return { ok: false, message: "Ponle nombre a la voz." };

    const files = form.getAll("samples").filter((item): item is File => item instanceof File);
    if (files.length === 0) return { ok: false, message: "Sube al menos una muestra de audio." };

    const samples = await Promise.all(
      files.slice(0, 5).map(async (file) => ({
        filename: file.name || "muestra.mp3",
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || "audio/mpeg",
      })),
    );

    const { voiceId } = await cloneVoice({
      name,
      description: readText(form.get("description")),
      samples,
    });

    return {
      ok: true,
      message: `Voz «${name}» creada (${voiceId}). Ya sale en la lista de voces.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo clonar." };
  }
}

/** Las voces disponibles, incluidas las clonadas. */
export async function studioVoicesAction() {
  await guard();

  try {
    return await listVoices();
  } catch {
    return [];
  }
}

/* -------------------------------- El montaje ------------------------------- */

/**
 * Monta el proyecto con las piezas marcadas, en su orden.
 *
 * Los planos se recortan y se encadenan **antes** del montaje, igual que en el
 * pipeline de producto: pasarle varios planos a la vez al montaje devuelve el
 * último repetido de principio a fin.
 */
export async function assembleProjectAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const preset = readText(raw.preset);

  if (!projectId) throw new Error("Falta el proyecto.");
  await guard();

  const assets = sorted(await listAssets(projectId)).filter((asset) => asset.included);

  const clips = assets.filter((asset) => asset.kind === "clip");
  if (clips.length === 0) throw new Error("Marca al menos un clip para montar.");

  const voice = assets.find((asset) => asset.kind === "voz");
  const music = assets.find((asset) => asset.kind === "musica");

  return runInBackground({
    kind: "imagenes",
    label: "Montaje del estudio",
    revalidate: "/estudio",
    resume: { projectId, preset },
    work: async (report) => {
      const trimmed: string[] = [];

      for (const [index, clip] of clips.entries()) {
        await report(`Preparando plano ${index + 1} de ${clips.length}`);

        // Solo se recorta lo que tiene duración puesta: sin ella, el clip entero.
        trimmed.push(clip.seconds > 0 ? await trimClip(clip.url, clip.seconds) : clip.url);
      }

      await report("Encadenando los planos");

      const picture = await mergeVideos(trimmed);

      const total = clips.reduce((sum, clip) => sum + (clip.seconds || 0), 0);
      const seconds = Math.max(total, voice?.seconds ?? 0) || total;

      await report("Pegando el audio");

      const result = await compose([
        {
          id: "video",
          type: "video",
          keyframes: [{ timestamp: 0, duration: Math.round(seconds * 1000), url: picture }],
        },
        ...(voice
          ? [
              {
                id: "voz",
                type: "audio" as const,
                keyframes: [{ timestamp: 0, duration: Math.round(seconds * 1000), url: voice.url }],
              },
            ]
          : []),
        ...(music
          ? [
              {
                id: "musica",
                type: "audio" as const,
                keyframes: [{ timestamp: 0, duration: Math.round(seconds * 1000), url: music.url }],
              },
            ]
          : []),
      ]);

      let finalUrl = result.videoUrl;
      let extra = "";

      if (preset) {
        await report("Quemando los subtítulos");

        try {
          // Sin SRT propio se transcribe el audio, que aquí sí vale: el texto lo
          // escribe quien monta y no va en fonético como el de los guiones.
          finalUrl = await burnSubtitles({ videoUrl: result.videoUrl, srt: "", preset });
          extra = `, subtítulos «${preset}»`;
        } catch (error) {
          extra = `. Sin subtítulos: ${error instanceof Error ? error.message : "falló"}`;
        }
      }

      await addAsset({
        projectId,
        kind: "video",
        url: finalUrl,
        name: `Montaje · ${clips.length} planos`,
        model: "Montaje",
        seconds,
      });

      return { summary: `Montado con ${clips.length} plano(s)${extra}.` };
    },
  });
}
