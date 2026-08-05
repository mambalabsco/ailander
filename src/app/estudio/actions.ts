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
  normalizeLoudness,
  speak,
  trimClip,
} from "@/lib/video/providers";
import {
  estimateCliCost,
  generateWithCli,
  modelDurations,
  modelMediaParams,
} from "@/lib/higgsfield-cli";
import { costLabel } from "@/lib/higgsfield-params";
import { findMusicGenerator, musicCostLabel } from "@/lib/video/music";
import { belowVoice, findMusicLevel } from "@/lib/video/loudness";
import { estimateCost, findGenerator, VIDEO_GENERATORS } from "@/lib/video/catalog";
import { subtitleLanguage } from "@/lib/video/vocabulary";
import { DEFAULT_PRESET, findVoicePreset } from "@/lib/video/voice-settings";
import { polishPrompt, POLISH_SCHEMA, type PolishedPrompt } from "@/lib/video/prompt-polish";
import { generateStructured } from "@/lib/generators";
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

/**
 * Un clip con un modelo de vídeo de Higgsfield, por su CLI.
 *
 * Va aparte del resto porque no se le parece en nada: el catálogo lo dice el
 * CLI en marcha y las referencias viajan como archivos en vez de como
 * direcciones. Meterlo en la misma función que los de kie obligaría a fingir
 * campos que aquí no existen.
 *
 * ## La duración sí se pide
 *
 * Antes no: se leía en la pantalla, se guardaba y se quedaba ahí. Todos los
 * vídeos salían con la duración por defecto del modelo, y como el campo estaba
 * y se dejaba escribir, parecía que hacía algo. Ahora se manda, y si el modelo
 * no acepta ese número se ajusta al más cercano **diciéndolo**.
 */
async function makeCliClip(input: {
  projectId: string;
  prompt: string;
  slug: string;
  references: string[];
  aspectRatio: string;
  seconds: number;
}): Promise<LaunchResult> {
  if (!input.prompt) throw new Error("Escribe qué quieres ver.");

  await guard();

  return runInBackground({
    kind: "imagenes",
    label: `Clip · ${input.slug}`,
    revalidate: "/estudio",
    resume: {
      projectId: input.projectId,
      prompt: input.prompt,
      model: `hf:${input.slug}`,
      references: input.references,
      aspectRatio: input.aspectRatio,
    },
    work: async (report) => {
      /*
       * Se le pregunta al modelo con qué bandera quiere las imágenes.
       *
       * Uno que hace vídeo desde un primer fotograma quiere `--start-image` y
       * otro que mantiene un personaje quiere `--image-references`. La bandera
       * equivocada no se ignora: aborta la generación con «Unknown params».
       */
      const [params, durations] = await Promise.all([
        input.references.length > 0 ? modelMediaParams(input.slug) : Promise.resolve([]),
        modelDurations(input.slug).catch(() => [] as number[]),
      ]);

      /*
       * Los segundos que ese modelo vende, no los que se teclearon.
       *
       * Mandar una duración que no acepta aborta con «Unknown params», y no
       * mandarla deja la suya por defecto. Se ajusta al valor más cercano de los
       * que declara y se cuenta: un vídeo de cinco segundos cuando se pidieron
       * diez tiene que decirlo antes, no descubrirse al verlo.
       *
       * Si no declara ninguna, se manda lo pedido: puede que las acepte todas.
       */
      const seconds =
        durations.length > 0
          ? durations.reduce((best, option) =>
              Math.abs(option - input.seconds) < Math.abs(best - input.seconds) ? option : best,
            )
          : input.seconds;

      if (durations.length > 0 && seconds !== input.seconds) {
        await report(
          `${input.slug} no hace ${input.seconds} s: va de ${durations.join(", ")}. Se generan ${seconds}.`,
        );
      }

      if (input.references.length > 0 && params.length === 0) {
        throw new Error(
          `${input.slug} no acepta imágenes de partida. Escribe el prompt sin marcar ninguna, o elige otro modelo.`,
        );
      }

      await report(
        params.length > 0
          ? `Generando con ${input.slug} y ${input.references.length} imagen(es)`
          : `Generando con ${input.slug}`,
      );

      const bytes = await Promise.all(
        input.references.map(async (reference, index) => {
          const response = await fetch(reference, { cache: "no-store" });
          return {
            filename: `ref-${index}.png`,
            bytes: new Uint8Array(await response.arrayBuffer()),
          };
        }),
      );

      const result = await generateWithCli({
        model: input.slug,
        prompt: input.prompt,
        kind: "video",
        // El primero que declare: `image_references` si está, y si no el que haya.
        referenceParam: params.includes("image_references") ? "image_references" : params[0],
        references: bytes,
        aspectRatio: input.aspectRatio,
        seconds,
      });

      await addAsset({
        projectId: input.projectId,
        kind: "clip",
        url: result.imageUrls[0],
        name: input.prompt.slice(0, 60) || "Clip",
        model: input.slug,
        prompt: input.prompt,
      });

      return { summary: `Clip listo con ${input.slug}. Lo que cobra Higgsfield lo dice tu cuenta.` };
    },
  });
}

/**
 * Genera un clip con cualquiera de los modelos del catálogo.
 *
 * De una imagen, de varias referencias o solo de un texto, según lo que admita
 * el modelo elegido. La comprobación de qué admite se hace **aquí**, en el
 * servidor: la pantalla ya no ofrece lo imposible, pero eso es comodidad, no una
 * garantía — la petición llega igual si alguien la manda a mano.
 */
export async function makeClipAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const prompt = readText(raw.prompt);
  const modelId = readText(raw.model) || VIDEO_GENERATORS[0].id;
  const seconds = Number(raw.seconds) || 6;
  const sound = raw.sound === true;
  const aspectRatio = readText(raw.aspectRatio) || "9:16";

  const references = [readText(raw.imageUrl), ...(Array.isArray(raw.references) ? raw.references : [])]
    .map((value) => readText(value))
    .filter(Boolean);

  if (!projectId) throw new Error("Falta el proyecto.");

  // Los de Higgsfield van por su CLI y llevan `hf:` delante, igual que en las
  // imágenes. Su catálogo lo da él en marcha, así que no está en la tabla.
  if (modelId.startsWith("hf:")) {
    return makeCliClip({
      projectId,
      prompt,
      slug: modelId.slice(3),
      references,
      aspectRatio,
      seconds,
    });
  }

  const model = findGenerator(modelId);

  if (model.mode === "texto" && !prompt) {
    throw new Error(`${model.label} parte solo del texto, así que el prompt es obligatorio.`);
  }

  if (model.mode !== "texto" && references.length === 0) {
    throw new Error(`${model.label} necesita al menos una imagen. Elige una del proyecto.`);
  }

  await guard();
  await needsKey();

  const cost = estimateCost(model, seconds);

  return runInBackground({
    kind: "imagenes",
    label: `Clip · ${model.label}`,
    revalidate: "/estudio",
    resume: { projectId, prompt, model: modelId, seconds, references, sound },
    work: async (report) => {
      await report(
        model.mode === "texto"
          ? `Generando ${seconds} s de texto con ${model.label}`
          : `Animando ${seconds} s con ${model.label} y ${references.length} referencia${references.length === 1 ? "" : "s"}`,
      );

      const url = await animate({
        references,
        prompt: prompt || "subtle natural motion, camera moves slowly",
        seconds: Math.max(1, Math.round(seconds)),
        model: model.slug,
        sound,
        aspectRatio,
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

      // Sin precio confirmado no se inventa uno: lo que se cobre lo dice el
      // proveedor, y un número puesto a ojo se toma por bueno al decidir.
      return {
        summary:
          cost === null
            ? `Clip de ${seconds} s listo con ${model.label}. El precio de este modelo no está confirmado.`
            : `Clip de ${seconds} s listo. Cuesta ${cost.toFixed(2)} USD.`,
      };
    },
  });
}

/**
 * Reescribe un prompt flojo como un prompt de vídeo.
 *
 * Va en directo y no en segundo plano: son unos segundos y la persona está
 * mirando el campo de texto esperando para seguir escribiendo. Mandarlo a la
 * cola de trabajos obligaría a cambiar de pantalla para leer el resultado.
 *
 * Lo escribe el mismo modelo que redacta los copys de la plataforma. Se pidió
 * «un llamado a chatgpt» y aquí el proveedor configurado es Claude; si hace
 * falta OpenAI concretamente, es una clave más y este es el único sitio que
 * habría que tocar.
 */
export async function polishPromptAction(
  input: unknown,
): Promise<{ ok: boolean; prompt: string; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const draft = readText(raw.draft);

  if (!draft) return { ok: false, prompt: "", message: "Escribe algo primero, aunque sea flojo." };

  try {
    await guard();

    const model = findGenerator(readText(raw.model));

    const outcome = await generateStructured<PolishedPrompt>({
      prompt: polishPrompt({
        draft,
        modelLabel: model.label,
        fromImage: model.mode !== "texto",
        seconds: Number(raw.seconds) || 0,
        context: readText(raw.context),
      }),
      schema: POLISH_SCHEMA as unknown as Record<string, unknown>,
      role: "copy",
      maxTokens: 2_000,
      effort: "low",
    });

    return { ok: true, prompt: outcome.data.prompt, message: outcome.data.cambios };
  } catch (error) {
    return {
      ok: false,
      prompt: "",
      message: error instanceof Error ? error.message : "No se pudo mejorar el prompt.",
    };
  }
}

/** Una locución con la voz que se elija. */
export async function makeVoiceAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const text = readText(raw.text);
  const voiceId = readText(raw.voiceId);
  const tone = readText(raw.tone) || DEFAULT_PRESET;

  if (!projectId || !text) throw new Error("Escribe el texto.");
  if (!voiceId) throw new Error("Elige una voz.");

  await guard();

  return runInBackground({
    kind: "imagenes",
    label: `Voz · ${text.slice(0, 40)}`,
    revalidate: "/estudio",
    resume: { projectId, text, voiceId, tone },
    work: async (report) => {
      await report("Generando la voz");

      const voice = await speak({ text, voiceId, settings: findVoicePreset(tone).settings });

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

/** Música a medida, ya al volumen que le toca para que no tape una locución. */
export async function makeMusicAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const projectId = readText(raw.projectId);
  const prompt = readText(raw.prompt);
  const seconds = Math.max(5, Math.min(600, Number(raw.seconds) || 30));
  const modelId = readText(raw.model);
  const levelId = readText(raw.level);

  if (!projectId || !prompt) throw new Error("Describe la música que quieres.");

  await guard();

  const generator = findMusicGenerator(modelId);
  const level = findMusicLevel(levelId);

  return runInBackground({
    kind: "imagenes",
    label: `Música · ${generator.label}`,
    revalidate: "/estudio",
    resume: { projectId, prompt, seconds, model: modelId, level: levelId },
    work: async (report) => {
      await report(`Componiendo con ${generator.label}`);

      const { url } = await makeMusic({ prompt, seconds, model: generator.id });

      await report(`Dejándola ${belowVoice(level)} LU por debajo de una voz`);

      /*
       * El volumen se ajusta por sonoridad y fuera, no multiplicando muestras.
       *
       * Lo segundo solo sabía de WAV, y de los cinco generadores solo uno lo
       * devuelve: con los demás el archivo salía intacto y a volumen de canción.
       */
      const levelled = await normalizeLoudness(url, level.lufs);

      const response = await fetch(levelled, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo descargar la música ya ajustada.");

      const { supabase, userId } = await requireContext();
      const path = `${userId}/${projectId}/${crypto.randomUUID()}.wav`;

      await supabase.storage
        .from("studio")
        .upload(path, Buffer.from(await response.arrayBuffer()), { contentType: "audio/wav" });

      await addAsset({
        projectId,
        kind: "musica",
        url: supabase.storage.from("studio").getPublicUrl(path).data.publicUrl,
        name: prompt.slice(0, 60),
        model: generator.label,
        prompt,
        seconds,
      });

      return {
        summary: `Cama con ${generator.label}, a ${level.label.toLowerCase()}. ${musicCostLabel(generator, seconds)} Escúchala en la tira antes de montar.`,
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
        await report("Transcribiendo y quemando los subtítulos");

        try {
          // Los transcribe del vídeo ya montado: es la única forma de que los
          // tiempos cuadren con lo que de verdad se oye.
          finalUrl = await burnSubtitles({
            videoUrl: result.videoUrl,
            preset,
            language: subtitleLanguage(),
          });
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

/**
 * Qué duraciones acepta un modelo de Higgsfield, para la pantalla.
 *
 * Vacío es «no lo dice», y entonces la pantalla enseña un campo libre. Se
 * devuelve vacío también cuando falla: quedarse sin poder elegir segundos es
 * peor que elegirlos a mano.
 */
export async function cliDurationsAction(slug: unknown): Promise<number[]> {
  try {
    await guard();

    const id = readText(slug);
    if (!id) return [];

    return await modelDurations(id);
  } catch {
    return [];
  }
}

/**
 * Lo que va a costar esa generación de Higgsfield, antes de lanzarla.
 *
 * Va por `generate cost`, que es el mismo cálculo que hace el trabajo real pero
 * sin crearlo. El mensaje ya viene redactado —incluido el caso de que no haya
 * tarifa de crédito configurada— para que la pantalla no tenga que decidir qué
 * hacer con un `null`.
 */
export async function cliCostAction(input: unknown): Promise<{ label: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await guard();

    const slug = readText(raw.slug);
    const prompt = readText(raw.prompt);

    if (!slug || !prompt) return { label: "" };

    const cost = await estimateCliCost({
      model: slug,
      prompt,
      seconds: Number(raw.seconds) || undefined,
    });

    return { label: costLabel(cost.credits, cost.usd) };
  } catch (error) {
    return {
      label: error instanceof Error ? error.message : "No se pudo calcular el coste.",
    };
  }
}

/**
 * Buscar música libre de derechos en catálogos abiertos.
 *
 * ## Lo que devuelve y lo que no
 *
 * Solo pistas con licencia que **permite anuncios**: CC0 siempre, y CC BY si se
 * acepta citar al autor. Lo demás no se enseña. Buscando música de fondo en
 * catálogos libres, lo que más abunda es `by-nc-nd` —prohíbe el uso comercial y
 * prohíbe montarla en un vídeo— y suena exactamente igual de bien.
 *
 * Un fallo aquí no se ve al mirar el anuncio: aparece meses después en forma de
 * reclamación.
 */
export async function searchMusicAction(input: unknown): Promise<{
  tracks: import("@/lib/video/music-library").Track[];
  problem: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await guard();

    const { searchFreeMusic } = await import("@/lib/music-search");

    return await searchFreeMusic({
      text: readText(raw.text),
      minSeconds: Number(raw.minSeconds) || 0,
      allowAttribution: raw.allowAttribution === true,
    });
  } catch (error) {
    return {
      tracks: [],
      problem: error instanceof Error ? error.message : "No se pudo buscar música.",
    };
  }
}

/**
 * Que un modelo elija de la lista, según criterios escritos.
 *
 * Se le pasan **las pistas que hay** y se le pide el identificador de una de
 * ellas. Preguntarle sin la lista devuelve una descripción preciosa de una
 * canción que no existe, y entonces hay que buscarla a mano — que es justo el
 * trabajo que esto venía a quitar.
 *
 * El identificador se comprueba contra la lista antes de devolverlo: un modelo
 * puede inventárselo, y usarlo sin comprobar pondría en el anuncio una música
 * que no existe.
 */
export async function pickMusicAction(input: unknown): Promise<{
  trackId: string;
  why: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await guard();

    const { buildPickPrompt, readPick } = await import("@/lib/video/music-library");
    type Track = import("@/lib/video/music-library").Track;

    const tracks = (Array.isArray(raw.tracks) ? raw.tracks : []) as Track[];
    const criteria = readText(raw.criteria);

    if (tracks.length === 0) return { trackId: "", why: "No hay ninguna pista donde elegir." };
    if (!criteria) return { trackId: "", why: "Escribe con qué criterio quieres que elija." };

    /*
     * Con esquema y no con texto libre.
     *
     * La API obliga a que la respuesta cumpla la forma, así que el
     * identificador llega en su propio campo en vez de haber que sacarlo de
     * entre la prosa. Aun así se comprueba contra la lista: cumplir el esquema
     * garantiza que hay una cadena, no que esa cadena sea una pista que existe.
     */
    const answer = await generateStructured<{ trackId: string; why: string }>({
      prompt: buildPickPrompt({ criteria, tracks, seconds: Number(raw.seconds) || 0 }),
      schema: {
        type: "object",
        properties: {
          trackId: {
            type: "string",
            description: "El identificador exacto de la pista elegida, o vacío si ninguna sirve.",
          },
          why: { type: "string", description: "En dos frases, por qué esa y no las otras." },
        },
        required: ["trackId", "why"],
        additionalProperties: false,
      },
      role: "copy",
    });

    const pick = readPick(`[${answer.data.trackId}]`, tracks);

    /*
     * Sin identificador válido se devuelve la explicación tal cual.
     *
     * Puede ser que el modelo dijera que ninguna sirve —que es una respuesta
     * legítima y útil— o que se inventara una. En los dos casos lo que hay que
     * enseñar es lo que contestó, no un «no se pudo elegir» que esconde el
     * motivo.
     */
    return { trackId: pick?.id ?? "", why: answer.data.why.trim() };
  } catch (error) {
    return {
      trackId: "",
      why: error instanceof Error ? error.message : "No se pudo elegir.",
    };
  }
}

/**
 * Meter una pista del catálogo libre en el proyecto, como una más.
 *
 * Se llama `add…` y no `use…` a propósito: cualquier cosa que empiece por «use»
 * la trata React como un hook, y llamarla dentro de un manejador de eventos se
 * convierte en un error de compilación que no tiene nada que ver con lo que
 * hace la función.
 *
 * ## Por qué se guarda como asset y no como un caso aparte
 *
 * Porque entonces el montaje no tiene que saber que existe. Una pista de
 * catálogo encendida se mezcla igual que una generada: mismo camino, mismo
 * volumen, mismos avisos si es más corta que el vídeo. Un camino especial para
 * ella sería un sitio más donde el comportamiento puede divergir sin que nadie
 * lo note hasta ver el vídeo.
 *
 * Se guarda la dirección del catálogo, no una copia: son direcciones estables y
 * públicas —es lo que las hace utilizables por el montador— y copiar cada pista
 * llenaría el almacenamiento de música que no es nuestra.
 */
export async function addCatalogMusicAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await guard();

    const projectId = readText(raw.projectId);
    const url = readText(raw.url);
    const name = readText(raw.name) || "Música del catálogo";
    const license = readText(raw.license);

    if (!projectId) return { ok: false, message: "Falta el proyecto." };
    if (!url) return { ok: false, message: "Esa pista no trae dirección." };

    /*
     * La licencia se vuelve a comprobar aquí.
     *
     * Es la última puerta antes de que la pista entre en un anuncio, y lo que
     * llega es lo que mandó el navegador: fiarse de que la pantalla ya filtró
     * significa fiarse de una petición que cualquiera puede escribir a mano.
     */
    const { usableInAds } = await import("@/lib/video/music-library");

    if (!usableInAds(license)) {
      return {
        ok: false,
        message: `La licencia «${license || "desconocida"}» no permite usar esa música en un anuncio.`,
      };
    }

    await addAsset({
      projectId,
      kind: "musica",
      url,
      name,
      model: `catalogo:${license}`,
    });

    revalidatePath("/estudio");

    return { ok: true, message: `«${name}» añadida al proyecto.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo añadir.",
    };
  }
}
