import "server-only";

import { findProductAnywhere } from "@/lib/products";
import { readPrimaryImage } from "@/lib/image-store";
import { readAvatar } from "@/lib/data/avatars";
import { generateStructured } from "@/lib/generators";
import { SCRIPT_SCHEMA } from "@/lib/generation-schemas";
import { buildScriptPrompt } from "@/lib/video/script-prompt";
import {
  animate,
  burnSubtitles,
  compose,
  keyframe,
  makeMusic,
  mediaSeconds,
  mergeVideos,
  normalizeLoudness,
  speak,
  trimClip,
} from "@/lib/video/providers";
import { composeTracks, planAssembly } from "@/lib/flow/assemble";
import { buildVocabulary, subtitleLanguage } from "@/lib/video/vocabulary";
import { findGenerator } from "@/lib/video/catalog";
import { findMusicGenerator } from "@/lib/video/music";
import { findMusicLevel } from "@/lib/video/loudness";
import { findVoicePreset } from "@/lib/video/voice-settings";
import { inputsOf, order, type Flow, type FlowNode } from "@/lib/flow/graph";
import { saveOutput } from "@/lib/data/flows";

/**
 * Ejecutar un flujo.
 *
 * ## Qué hace y qué no
 *
 * Recorre el grafo en orden y llama, por cada nodo, a lo que la plataforma ya
 * sabe hacer. **No añade capacidades**: si algo no se puede generar desde su
 * pantalla, tampoco desde aquí. El lienzo ordena, no inventa.
 *
 * ## Reanudar sin volver a pagar
 *
 * Cada nodo guarda su resultado en cuanto termina. Si el flujo se corta en el
 * paso nueve, los ocho anteriores están hechos **y pagados**: al volver a
 * lanzarlo se leen y se salta directo al nueve. Sin esto, un fallo en el último
 * paso obligaría a pagar todo otra vez, que es la diferencia entre reintentar y
 * no reintentar.
 *
 * ## Y por qué en serie
 *
 * `readyNow` sabe qué nodos pueden ir en paralelo, y aquí se ejecutan de uno en
 * uno igualmente. El servidor tiene dos núcleos y los proveedores limitan
 * llamadas por minuto: lanzar seis clips a la vez no los hace más rápidos, los
 * hace fallar por cupo. Cuando eso deje de ser cierto, el orden ya está
 * calculado y solo hay que agrupar.
 */

export interface RunContext {
  runId: string;
  productId: string;
  /** Lo que varía entre ejecuciones del mismo flujo: el avatar, el ángulo. */
  variables: Record<string, string>;
  report: (message: string) => Promise<void>;
  /** Lo que ya está hecho de una vuelta anterior. */
  done: Map<string, NodeResult>;
}

export interface NodeResult {
  kind: string;
  url: string;
  value: string;
}

function text(settings: Record<string, unknown>, key: string, fallback = ""): string {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function num(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Lo que entra en un nodo, ya resuelto.
 *
 * Se devuelve por puerto y en el orden en que se conectó: para un generador con
 * dos referencias, cuál va primero **cambia el resultado**, y ese orden es el
 * que se dibujó.
 */
function gather(
  flow: Flow,
  nodeId: string,
  done: Map<string, NodeResult>,
): Map<number, NodeResult[]> {
  const out = new Map<number, NodeResult[]>();

  for (const [port, sources] of inputsOf(flow, nodeId)) {
    out.set(
      port,
      sources.map((id) => done.get(id)).filter((item): item is NodeResult => Boolean(item)),
    );
  }

  return out;
}

const first = (inputs: Map<number, NodeResult[]>, port: number): NodeResult | null =>
  inputs.get(port)?.[0] ?? null;

const urls = (inputs: Map<number, NodeResult[]>, port: number): string[] =>
  (inputs.get(port) ?? []).map((item) => item.url).filter(Boolean);

/* ------------------------------- Cada nodo --------------------------------- */

async function runNode(
  node: FlowNode,
  inputs: Map<number, NodeResult[]>,
  ctx: RunContext,
): Promise<NodeResult> {
  switch (node.type) {
    case "producto": {
      const product = await findProductAnywhere(ctx.productId);
      if (!product) throw new Error("El flujo no tiene producto elegido.");

      const image = await readPrimaryImage(ctx.productId);
      const url = image?.shopifyUrl || image?.url || "";

      /*
       * Sin foto del envase se para **aquí**, no al generar.
       *
       * Es el mismo fallo de siempre: sin ella el generador inventa un bote
       * convincente, y el flujo entero sale con un producto que no existe.
       * Descubrirlo al final son diez generaciones pagadas.
       */
      if (!url) {
        throw new Error(
          `«${product.name}» no tiene imagen principal, así que el envase saldría inventado.`,
        );
      }

      return { kind: "producto", url, value: product.name };
    }

    case "avatar": {
      // El avatar puede venir de la ejecución —para lanzar el mismo flujo con
      // varias caras— o estar fijado en el nodo.
      const id = ctx.variables.avatar || text(node.settings, "avatarId");
      if (!id) throw new Error("Ese nodo de avatar no tiene ninguna cara elegida.");

      const avatar = await readAvatar(id);
      if (!avatar) throw new Error("Esa cara ya no existe.");

      return { kind: "imagen", url: avatar.url, value: avatar.description };
    }

    case "archivo": {
      const url = text(node.settings, "url");
      if (!url) throw new Error("Ese nodo no tiene ningún archivo.");

      return { kind: "imagen", url, value: text(node.settings, "name") };
    }

    case "prompt": {
      const own = text(node.settings, "text");
      const upstream = first(inputs, 0);

      // Lo de arriba se antepone cuando lo hay: un nodo de prompt colgando de
      // otro es para afinar, no para sustituir.
      const value = [upstream?.value, own].filter(Boolean).join(" ");
      if (!value) throw new Error("Ese nodo de prompt está vacío.");

      return { kind: "texto", url: "", value };
    }

    case "guion": {
      const product = await findProductAnywhere(ctx.productId);
      if (!product) throw new Error("El flujo no tiene producto elegido.");

      const reference = first(inputs, 1);

      await ctx.report("Escribiendo el guion");

      const script = await generateStructured<{
        title: string;
        shots: { n: string; guion: string; sub?: string }[];
      }>({
        prompt: buildScriptPrompt({
          productName: product.name,
          audience: product.targetAudience || "el público objetivo",
          country: product.country || "México",
          body: reference?.value || product.description,
          shots: num(node.settings, "shots", 6),
          seconds: num(node.settings, "seconds", 45),
          reference: ctx.variables.angulo || undefined,
        }),
        schema: SCRIPT_SCHEMA,
        role: "copy",
        maxTokens: 16_000,
      });

      const value = (script.data.shots ?? []).map((shot) => shot.guion).join(" ");
      if (!value) throw new Error("El guion salió vacío.");

      return { kind: "guion", url: "", value };
    }

    case "imagen": {
      const prompt = first(inputs, 0);
      if (!prompt) throw new Error("Ese nodo de imagen no tiene prompt.");

      await ctx.report("Generando la imagen");

      const url = await keyframe({
        prompt: prompt.value,
        references: urls(inputs, 1),
        aspectRatio: text(node.settings, "aspectRatio", "9:16"),
      });

      return { kind: "imagen", url, value: prompt.value };
    }

    case "clip": {
      const prompt = first(inputs, 0);
      if (!prompt) throw new Error("Ese nodo de clip no tiene prompt.");

      const model = findGenerator(text(node.settings, "model"));
      await ctx.report(`Animando con ${model.label}`);

      const url = await animate({
        prompt: prompt.value,
        references: urls(inputs, 1),
        seconds: num(node.settings, "seconds", 6),
        model: model.slug,
        aspectRatio: text(node.settings, "aspectRatio", "9:16"),
        sound: node.settings.sound === true,
      });

      return { kind: "video", url, value: prompt.value };
    }

    case "anuncio": {
      const script = first(inputs, 0);
      if (!script) throw new Error("Ese nodo no tiene guion.");

      /*
       * Seedance acepta un guion de veinte mil caracteres, así que aquí va el
       * guion **entero** y no una frase. Es lo que lo distingue de encadenar
       * clips: un solo encargo con toda la historia dentro.
       */
      const model = findGenerator(text(node.settings, "model", "seedance2"));
      await ctx.report(`Generando el anuncio con ${model.label}`);

      const url = await animate({
        prompt: script.value.slice(0, 20_000),
        // Hasta nueve, que es su tope: pasarse lo rechaza.
        references: urls(inputs, 1).slice(0, 9),
        seconds: num(node.settings, "seconds", 15),
        model: model.slug,
        aspectRatio: text(node.settings, "aspectRatio", "9:16"),
        // Con sonido propio salvo que se diga: es la gracia de este nodo.
        sound: node.settings.sound !== false,
      });

      return { kind: "video", url, value: script.value };
    }

    case "voz": {
      const script = first(inputs, 0);
      if (!script) throw new Error("Ese nodo de voz no tiene texto.");

      const voiceId = text(node.settings, "voiceId");
      if (!voiceId) throw new Error("Ese nodo de voz no tiene ninguna voz elegida.");

      await ctx.report("Generando la voz");

      const voice = await speak({
        text: script.value,
        voiceId,
        settings: findVoicePreset(text(node.settings, "tone")).settings,
      });

      const { uploadVideoAsset } = await import("@/lib/data/video-assets");

      const url = await uploadVideoAsset({
        videoId: ctx.runId,
        name: `voz-${node.id}.mp3`,
        data: voice.audio,
        contentType: "audio/mpeg",
      });

      return { kind: "audio", url, value: String(voice.seconds) };
    }

    case "musica": {
      const brief = first(inputs, 0);
      const generator = findMusicGenerator(text(node.settings, "model"));
      const level = findMusicLevel(text(node.settings, "level"));

      await ctx.report(`Componiendo con ${generator.label}`);

      const { url } = await makeMusic({
        prompt: brief?.value || text(node.settings, "prompt", "cálida y esperanzadora, sin voces"),
        seconds: num(node.settings, "seconds", 30),
        model: generator.id,
      });

      // Al volumen que le toca antes de guardarla: el montaje mezcla sin control
      // de volumen y una cama a nivel de canción tapa la locución.
      const levelled = await normalizeLoudness(url, level.lufs);

      return { kind: "audio", url: levelled, value: generator.label };
    }

    case "montaje": {
      const clips = inputs.get(0) ?? [];
      if (clips.length === 0) throw new Error("Ese montaje no tiene ningún plano.");

      /*
       * Las duraciones se **preguntan**, no se suponen.
       *
       * Un clip de «seis segundos» rara vez dura seis, y de uno subido a mano no
       * se sabe nada. Con seis planos, medio segundo de error por plano son tres
       * de desfase entre imagen y voz — que es lo que se lee como «no está
       * sincronizado».
       */
      await ctx.report("Midiendo lo que dura cada pista");

      const measured = await Promise.all(
        clips.map(async (item) => ({
          id: item.url,
          url: item.url,
          seconds: Number(item.value) > 0 ? Number(item.value) : await mediaSeconds(item.url),
        })),
      );

      const audios = inputs.get(1) ?? [];

      /*
       * Cuál es la voz y cuál la música, sin preguntarlo.
       *
       * Los dos son audio y llegan por el mismo puerto. La voz trae sus segundos
       * en `value` —los devuelve el generador— y la música no: es la única
       * diferencia fiable sin añadir un puerto más que habría que explicar.
       */
      const voiceInput = audios.find((item) => Number(item.value) > 0) ?? null;
      const musicInput = audios.find((item) => item !== voiceInput) ?? null;

      const voice = voiceInput
        ? { id: "voz", url: voiceInput.url, seconds: Number(voiceInput.value) || 0 }
        : null;

      const music = musicInput
        ? { id: "musica", url: musicInput.url, seconds: await mediaSeconds(musicInput.url) }
        : null;

      const plan = planAssembly({ clips: measured, voice, music });

      /*
       * Lo que impide montar se dice **antes** de gastar en recortes.
       *
       * Montar cuesta céntimos, pero un montaje que sale mal cuesta la vuelta
       * entera de mirarlo y volver a lanzarlo.
       */
      if (plan.blockers.length > 0) throw new Error(plan.blockers.join(" "));

      /*
       * Cada plano se recorta por separado y después se encadenan.
       *
       * Es el arreglo del fallo que costó varias vueltas: pasarle los planos
       * sueltos al montador para que los colocara devolvía el último repetido de
       * principio a fin, aunque los archivos fueran distintos.
       */
      const trimmed: string[] = [];

      for (const [index, item] of plan.clips.entries()) {
        await ctx.report(`Recortando plano ${index + 1} de ${plan.clips.length}`);
        trimmed.push(item.seconds > 0 ? await trimClip(item.url, item.seconds) : item.url);
      }

      await ctx.report("Encadenando los planos");

      // Con uno solo no hay nada que encadenar, y el encadenador pide dos.
      const picture = trimmed.length > 1 ? await mergeVideos(trimmed) : trimmed[0];

      await ctx.report("Pegando la voz y la música");

      const result = await compose(composeTracks(plan, picture));

      let url = result.videoUrl;
      const preset = text(node.settings, "subtitles");

      if (preset) {
        await ctx.report("Transcribiendo y quemando los subtítulos");

        try {
          /*
           * Los transcribe del vídeo ya montado. Calcular los tiempos aquí es
           * lo que los descuadraba: describen el archivo de voz suelto, no el
           * vídeo terminado.
           */
          const script = first(inputs, 2);

          url = await burnSubtitles({
            videoUrl: result.videoUrl,
            preset,
            language: subtitleLanguage(),
            vocabulary: script
              ? buildVocabulary({ shots: [{ guion: script.value }] })
              : [],
          });
        } catch (error) {
          // Un fallo aquí no tira el montaje: el vídeo ya está y se ve entero.
          plan.warnings.push(
            `Sin subtítulos: ${error instanceof Error ? error.message : "falló"}`,
          );
        }
      }

      if (plan.warnings.length > 0) await ctx.report(plan.warnings.join(" "));

      return { kind: "video", url, value: plan.warnings.join(" ") };
    }

    default:
      throw new Error(`«${node.type}» no es un nodo que se pueda ejecutar.`);
  }
}

/* ------------------------------ El recorrido ------------------------------- */

export interface RunOutcome {
  done: number;
  total: number;
  failed: { nodeId: string; problem: string }[];
}

export async function runFlow(flow: Flow, ctx: RunContext): Promise<RunOutcome> {
  const sequence = order(flow);
  if (!sequence) throw new Error("El flujo tiene un círculo: no hay orden posible.");

  const results = new Map(ctx.done);
  const failed: RunOutcome["failed"] = [];
  let done = 0;

  for (const [index, nodeId] of sequence.entries()) {
    const node = flow.nodes.find((item) => item.id === nodeId);
    if (!node) continue;

    // Ya hecho en una vuelta anterior: no se vuelve a pagar.
    if (results.has(nodeId)) {
      done += 1;
      continue;
    }

    /*
     * Un nodo cuyo padre falló no se intenta.
     *
     * Sin esto se lanza igualmente, falla por falta de entrada y suma un error
     * más que confunde: el que importa es el primero, y los demás son su eco.
     */
    const parents = [...inputsOf(flow, nodeId).values()].flat();
    if (parents.some((parent) => !results.has(parent))) {
      failed.push({ nodeId, problem: "No se intentó: falló algo de lo que depende." });
      continue;
    }

    await ctx.report(`Paso ${index + 1} de ${sequence.length}`);

    try {
      const result = await runNode(node, gather(flow, nodeId, results), ctx);

      results.set(nodeId, result);
      await saveOutput({ runId: ctx.runId, nodeId, ...result });
      done += 1;
    } catch (error) {
      const problem = error instanceof Error ? error.message : "falló";

      failed.push({ nodeId, problem });
      await saveOutput({ runId: ctx.runId, nodeId, kind: "texto", error: problem });
    }
  }

  return { done, total: sequence.length, failed };
}
