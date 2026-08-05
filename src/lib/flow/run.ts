import "server-only";

import { findProductAnywhere } from "@/lib/products";
import { readPrimaryImage } from "@/lib/image-store";
import { readProductResearch } from "@/lib/research-store";
import { buildProductContext } from "@/lib/copy-prompts";
import { readAvatar } from "@/lib/data/avatars";
import { generateStructured } from "@/lib/generators";
import { SCRIPT_SCHEMA } from "@/lib/generation-schemas";
import { buildScriptPrompt } from "@/lib/video/script-prompt";
import { directorBrief } from "@/lib/video/director";
import {
  FLOW_COPY_SCHEMA,
  buildFlowCopyPrompt,
  findCopyFormat,
  renderCopy,
  type FlowCopy,
} from "@/lib/flow/copy";
import {
  animate,
  burnSubtitles,
  compose,
  keyframe,
  lastFrame,
  lipsync,
  makeMusic,
  mediaSeconds,
  mergeVideos,
  normalizeLoudness,
  speak,
  trimClip,
} from "@/lib/video/providers";
import { generateWithCli, modelDurations, modelMediaParams } from "@/lib/higgsfield-cli";
import { findLipsyncModel } from "@/lib/video/lipsync";
import { composeTracks, planAssembly } from "@/lib/flow/assemble";
import { buildVocabulary, subtitleLanguage } from "@/lib/video/vocabulary";
import { durationLabel, findGenerator, nearestDuration } from "@/lib/video/catalog";
import { planSegments, segmentInstruction, sliceScript, totalSeconds } from "@/lib/video/segments";
import { findMusicGenerator } from "@/lib/video/music";
import { findMusicLevel } from "@/lib/video/loudness";
import { findVoicePreset } from "@/lib/video/voice-settings";
import { inputsOf, order, readyNow, type Flow, type FlowNode } from "@/lib/flow/graph";
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
 * ## Y por qué en oleadas
 *
 * Esto iba de uno en uno por una razón que ya no es cierta: los proveedores
 * limitan llamadas por minuto y lanzar seis clips a la vez los hacía fallar por
 * cupo. Ahora todas las llamadas pasan por una cola que respeta ese tope
 * **sumando lo que manda toda la plataforma** y que reenvía sola lo que choca,
 * así que el trabajo de no pasarse ya no es de aquí.
 *
 * Lo que se gana: seis imágenes que no dependen entre sí tardaban seis veces lo
 * que tarda una. Ahora tardan lo que tarde la más lenta.
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

/**
 * De qué tipo de nodo viene cada entrada.
 *
 * Hace falta para el reparto: dos referencias pueden ser las dos «imagen» y una
 * ser el envase y otra la cara. Sin saber de dónde vienen, la única forma de
 * decírselo al generador sería adivinarlo por el texto.
 */
function sources(flow: Flow, nodeId: string): Map<number, string[]> {
  const out = new Map<number, string[]>();

  for (const [port, ids] of inputsOf(flow, nodeId)) {
    out.set(
      port,
      ids.map((id) => flow.nodes.find((node) => node.id === id)?.type ?? ""),
    );
  }

  return out;
}

const first = (inputs: Map<number, NodeResult[]>, port: number): NodeResult | null =>
  inputs.get(port)?.[0] ?? null;

const urls = (inputs: Map<number, NodeResult[]>, port: number): string[] =>
  (inputs.get(port) ?? []).map((item) => item.url).filter(Boolean);

/**
 * Las referencias, en bytes.
 *
 * El CLI de Higgsfield sube los ficheros él: no acepta una dirección. Y la que
 * no se pueda descargar se cae de la lista en vez de abortar — con dos caras de
 * referencia y una rota, generar con la que queda es mejor que no generar.
 */
async function downloadAll(
  references: string[],
  name = "ref.png",
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const got = await Promise.all(
    references.slice(0, 9).map(async (url, index) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0) return null;

        return { filename: `${index + 1}-${name}`, bytes };
      } catch {
        return null;
      }
    }),
  );

  return got.filter((item) => item !== null);
}

/* ------------------------------- Cada nodo --------------------------------- */

async function runNode(
  node: FlowNode,
  inputs: Map<number, NodeResult[]>,
  ctx: RunContext,
  from: Map<number, string[]> = new Map(),
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

    case "referencia": {
      /*
       * El texto vive en el nodo, no se vuelve a leer de la biblioteca.
       *
       * Un flujo es un plano que se ejecuta meses después: si guardara solo el
       * identificador, borrar ese copy dejaría el flujo apuntando a algo que ya
       * no existe — y eso falla al ejecutar, a mitad de la cadena y con lo
       * anterior pagado.
       */
      const value = text(node.settings, "text");
      if (!value) throw new Error("Ese nodo de referencia está vacío: elige un copy o un ángulo.");

      return { kind: "guion", url: "", value };
    }

    /*
      Una nota no llama a nadie: devuelve su texto y ya.

      Se deja pasar en vez de saltarla para que, si alguien la conecta a la
      entrada de un prompt, funcione como lo que parece.
    */
    case "nota":
      return { kind: "texto", url: "", value: text(node.settings, "text") };

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

    case "copy": {
      const product = await findProductAnywhere(ctx.productId);
      if (!product) throw new Error("El flujo no tiene producto elegido.");

      const format = findCopyFormat(text(node.settings, "format", "anuncio")).id;

      /*
       * El ángulo puede llegar por el cable o estar escrito en el nodo.
       *
       * Lo del cable manda: es lo que permite ejecutar el mismo flujo con cinco
       * ángulos distintos sin tocar la caja.
       */
      const angle = first(inputs, 1)?.value || text(node.settings, "angle");

      await ctx.report("Escribiendo el copy");

      const outcome = await generateStructured<FlowCopy>({
        prompt: buildFlowCopyPrompt({
          // El mismo contexto que usa el resto de la plataforma: dos ideas
          // distintas del mismo producto es cómo salen anuncios que se
          // contradicen entre sí.
          context: buildProductContext(product, await readProductResearch(ctx.productId), null),
          format,
          angle,
          language: product.language,
          seconds: num(node.settings, "seconds", 0),
        }),
        schema: FLOW_COPY_SCHEMA as unknown as Record<string, unknown>,
        role: "copy",
        maxTokens: 4_000,
      });

      const value = renderCopy(outcome.data, format);
      if (!value) throw new Error("El copy salió vacío.");

      return { kind: "guion", url: "", value };
    }

    case "imagen": {
      const prompt = first(inputs, 0);
      if (!prompt) throw new Error("Ese nodo de imagen no tiene prompt.");

      const references = urls(inputs, 1);
      const aspectRatio = text(node.settings, "aspectRatio", "9:16");

      /*
       * Con qué se genera.
       *
       * Vacío es el de siempre, así que los flujos ya guardados siguen dando lo
       * mismo que daban. Cualquier otra cosa es un modelo de Higgsfield, que va
       * por su CLI y no por la API: es la única vía que tiene, y era la razón
       * de que Higgsfield no existiera dentro de los flujos.
       */
      const model = text(node.settings, "model");

      if (model && model !== "nano-banana") {
        await ctx.report(`Generando la imagen con ${model}`);

        const result = await generateWithCli({
          model,
          prompt: prompt.value,
          aspectRatio,
          references: await downloadAll(references),
        });

        const image = result.imageUrls[0];
        if (!image) throw new Error(`${model} no devolvió ninguna imagen.`);

        return { kind: "imagen", url: image, value: prompt.value };
      }

      await ctx.report("Generando la imagen");

      const url = await keyframe({ prompt: prompt.value, references, aspectRatio });

      return { kind: "imagen", url, value: prompt.value };
    }

    case "labios": {
      const video = first(inputs, 0);
      const voice = first(inputs, 1);

      if (!video?.url) throw new Error("Ese nodo de lipsync no tiene vídeo.");
      if (!voice?.url) throw new Error("Ese nodo de lipsync no tiene voz.");

      const model = findLipsyncModel(text(node.settings, "model"));

      await ctx.report(`Sincronizando los labios con ${model.label}`);

      const done = await lipsync({
        videoUrl: video.url,
        audioUrl: voice.url,
        model: model.id,
        syncMode: text(node.settings, "syncMode", "remap"),
        detectOcclusion: node.settings.detectOcclusion === true,
      });

      /*
       * El valor que se arrastra es el del vídeo, no el de la voz: lo que sigue
       * en el flujo —el montaje, los subtítulos— espera el texto de la toma.
       */
      return { kind: "video", url: done.url, value: video.value };
    }

    case "clip": {
      const prompt = first(inputs, 0);
      if (!prompt) throw new Error("Ese nodo de clip no tiene prompt.");

      const chosen = text(node.settings, "model");

      /*
       * Los de Higgsfield van por su CLI, no por la API.
       *
       * Llevan `hf:` delante para distinguirlos, igual que en el estudio. Y
       * llevan otro camino entero: las referencias viajan como archivos, la
       * duración se comprueba contra lo que declara el modelo, y ni el sonido
       * ni el precio se piden aquí porque los pone él.
       */
      if (chosen.startsWith("hf:")) {
        const slug = chosen.slice(3);
        const wanted = num(node.settings, "seconds", 6);

        const voice = urls(inputs, 2);

        const [params, durations] = await Promise.all([
          urls(inputs, 1).length > 0 || voice.length > 0
            ? modelMediaParams(slug)
            : Promise.resolve([] as string[]),
          modelDurations(slug).catch(() => [] as number[]),
        ]);

        const seconds =
          durations.length > 0
            ? durations.reduce((best, option) =>
                Math.abs(option - wanted) < Math.abs(best - wanted) ? option : best,
              )
            : wanted;

        if (durations.length > 0 && seconds !== Math.round(wanted)) {
          await ctx.report(
            `${slug} no hace ${Math.round(wanted)} s: va de ${durations.join(", ")}. Se generan ${seconds}.`,
          );
        }

        if (voice.length > 0 && !params.includes("audio_references")) {
          await ctx.report(`${slug} no acepta voz de referencia: se genera sin ella.`);
        }

        await ctx.report(`Animando con ${slug}`);

        const result = await generateWithCli({
          model: slug,
          prompt: prompt.value,
          kind: "video",
          // El que declare: `image_references` si está, y si no el primero.
          referenceParam: params.includes("image_references") ? "image_references" : params[0],
          references: await downloadAll(urls(inputs, 1)),
          /*
           * La voz solo si el modelo la declara.
           *
           * Mandársela a uno que no la conoce aborta con «Unknown params», y
           * eso tira una generación de varios minutos por un extra opcional.
           * Y se dice cuando se cae, porque conectar la voz y que no se use es
           * exactamente lo que parecería que sí.
           */
          audio: params.includes("audio_references")
            ? await downloadAll(voice, "voz.mp3")
            : undefined,
          aspectRatio: text(node.settings, "aspectRatio", "9:16"),
          seconds,
        });

        const clip = result.imageUrls[0];
        if (!clip) throw new Error(`${slug} no devolvió ningún vídeo.`);

        return { kind: "video", url: clip, value: prompt.value };
      }

      const model = findGenerator(chosen);

      /*
       * La duración que el modelo acepta, no la que se pidió.
       *
       * Se calcula **aquí** y no dentro del proveedor porque hay que decirlo:
       * pedir treinta segundos a uno que vende diez no da error, devuelve diez.
       */
      const wanted = num(node.settings, "seconds", 6);
      const seconds = nearestDuration(model, wanted);

      if (seconds !== Math.round(wanted)) {
        await ctx.report(
          `${model.label} no hace ${Math.round(wanted)} s: va de ${seconds}. ${durationLabel(model)}.`,
        );
      }

      await ctx.report(`Animando con ${model.label}`);

      const url = await animate({
        prompt: prompt.value,
        references: urls(inputs, 1),
        seconds,
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
       * Seedance acepta un guion de veinte mil caracteres, así que aquí va la
       * **dirección entera** y no una frase: la estructura del anuncio, el
       * guion literal, cómo se rueda y qué no puede pasar. Es lo que lo
       * distingue de encadenar clips — un solo encargo con toda la película
       * dentro—, y mandarle solo el guion es desaprovecharlo: el guion dice lo
       * que se oye, no lo que se ve.
       */
      const model = findGenerator(text(node.settings, "model", "seedance2"));
      // Hasta nueve, que es su tope: pasarse rechaza la petición entera.
      const references = urls(inputs, 1).slice(0, 9);
      const aspectRatio = text(node.settings, "aspectRatio", "9:16");

      /*
       * Los segundos que el generador va a dar, no los que se pidieron.
       *
       * Aquí estaba el fallo que sacó un anuncio acelerado: se pedían cincuenta
       * segundos, el proveedor recortaba a quince sin decir nada **y la
       * dirección seguía diciendo «anuncio de 50 segundos»**. Así que el modelo
       * metía cincuenta segundos de historia en quince: todo el guion, el triple
       * de rápido, y ni un error en ningún sitio.
       *
       * El número se ajusta antes de escribir el encargo, así que lo que se pide
       * y lo que se genera son lo mismo. Y se dice, porque un anuncio que dura un
       * tercio de lo planeado es otro anuncio.
       */
      const wanted = num(node.settings, "seconds", 15);

      /*
       * Quién sale y dónde, descrito y repetido en todos los tramos.
       *
       * Es lo que hacía falta y no estaba: sin un reparto escrito, cada tramo se
       * reimagina a la persona a partir del fotograma anterior — y por eso
       * cambiaba de un tramo a otro. Con la descripción delante hay algo a lo
       * que volver, y deja de depender de lo que se adivine de una imagen.
       */
      const refTypes = from.get(1) ?? [];

      const cast = (inputs.get(1) ?? []).map((item, index) => {
        const type = refTypes[index] ?? "";

        const label =
          type === "producto"
            ? `El envase de ${item.value || "el producto"}`
            : type === "avatar"
              ? "La persona del anuncio"
              : type === "archivo"
                ? item.value || "Una imagen de referencia"
                : "Un fotograma de referencia";

        return { label, look: item.value || "tal y como se ve en la imagen" };
      });

      /*
       * Un anuncio largo, en un generador que solo hace piezas cortas.
       *
       * Antes se recortaba a lo que el modelo aceptaba y la dirección seguía
       * pidiendo la historia entera: salía el anuncio al triple de velocidad. La
       * otra salida —montar cuatro nodos y escribir una trama nueva en cada uno—
       * no da un anuncio de cincuenta segundos, da cuatro de quince pegados, con
       * otro sitio y otra cara en cada uno.
       *
       * Así que se parte en tramos que el generador sí acepta y se encadenan por
       * el último fotograma: cada uno empieza exactamente donde acabó el
       * anterior, y cada uno cuenta **su parte** del guion. Con un solo tramo
       * esto no cambia nada — es el caso normal y no paga nada de más.
       */
      const segments = planSegments({
        seconds: wanted,
        maxSeconds: model.maxSeconds,
        minSeconds: model.minSeconds,
        durations: model.durations,
      });

      const seconds = segments[0].seconds;
      const total = totalSeconds(segments);

      if (segments.length > 1) {
        await ctx.report(
          `${Math.round(wanted)} s no caben en una pieza de ${model.label}: van ${segments.length} tramos de ${seconds} s encadenados, ${total} s en total.`,
        );
      } else if (seconds !== Math.round(wanted)) {
        await ctx.report(
          `${model.label} no hace ${Math.round(wanted)} s: este anuncio va a durar ${seconds}. ${durationLabel(model)}.`,
        );
      }

      // El nombre solo para nombrarlo en el encargo; que falle no impide rodar.
      const product = await findProductAnywhere(ctx.productId).catch(() => null);

      /*
       * Con varios tramos, la voz **no** la pone el generador.
       *
       * Pone una distinta en cada llamada, así que cuatro tramos son cuatro
       * voces dentro del mismo anuncio: se oye saltar a mitad de frase. No da
       * error y no se ve en la miniatura — se descubre reproduciéndolo entero,
       * con los cuatro tramos pagados.
       *
       * Se puede forzar marcando el sonido a mano, pero entonces se avisa.
       */
      const wantsSound = node.settings.sound !== false;
      const nativeAudio = wantsSound && (segments.length === 1 || node.settings.sound === true);

      if (segments.length > 1 && nativeAudio) {
        await ctx.report(
          `Ojo: son ${segments.length} llamadas y el generador pone una voz distinta en cada una. La voz va a cambiar dentro del anuncio; para que sea la misma, quítale el sonido propio y móntale una locución.`,
        );
      } else if (segments.length > 1 && wantsSound) {
        await ctx.report(
          `Sin sonido del generador: en ${segments.length} tramos pondría una voz distinta en cada uno. Móntale una locución y quedará la misma de principio a fin.`,
        );
      }

      const pieces: string[] = [];
      /** El último fotograma del tramo anterior, que abre el siguiente. */
      let carry = "";

      for (const segment of segments) {
        const brief = directorBrief({
          script: sliceScript(script.value, segment),
          templateId: text(node.settings, "director"),
          productName: product?.name,
          language: product?.language,
          seconds: segment.seconds,
          aspectRatio,
          references: references.length + (carry ? 1 : 0),
          cast: carry ? [{ label: "El último plano del tramo anterior", look: "de ahí venimos" }, ...cast] : cast,
          continuity: segmentInstruction(segment),
        });

        if (brief.trimmed > 0) {
          await ctx.report(`El encargo no cabía: se recortaron ${brief.trimmed} caracteres.`);
        }

        await ctx.report(
          segments.length > 1
            ? `Generando el tramo ${segment.index} de ${segment.total} con ${model.label}`
            : `Generando el anuncio con ${model.label}`,
        );

        /*
         * El fotograma que encadena va **primero**.
         *
         * En los generadores por referencias, la primera manda: es la que fija
         * de dónde arranca la toma. Ponerla al final la deja como una
         * inspiración más y el tramo empieza donde quiere.
         */
        const piece = await animate({
          prompt: brief.prompt,
          references: [carry, ...references].filter(Boolean).slice(0, 9),
          seconds: segment.seconds,
          model: model.slug,
          aspectRatio,
          sound: nativeAudio,
        });

        pieces.push(piece);

        if (segment.index < segment.total) {
          await ctx.report(`Sacando el fotograma con el que sigue el tramo ${segment.index + 1}`);

          /*
           * Si no se puede sacar el fotograma, se sigue sin él.
           *
           * El tramo siguiente saldrá menos pegado, pero tirar un anuncio a
           * medias por esto sería tirar lo que ya está generado y pagado.
           */
          carry = await lastFrame(piece).catch(async (error: unknown) => {
            await ctx.report(
              `No se pudo encadenar por el fotograma: ${error instanceof Error ? error.message : "falló"}. El siguiente tramo puede no continuar igual.`,
            );
            return "";
          });
        }
      }

      await ctx.report(
        pieces.length > 1 ? "Uniendo los tramos" : "Anuncio listo",
      );

      const url = pieces.length > 1 ? await mergeVideos(pieces) : pieces[0];

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
  const broken = new Set<string>();

  let done = results.size;
  let wave = 0;

  /*
   * En oleadas, no de uno en uno.
   *
   * Esto iba en serie por una razón que ya no es cierta: los proveedores limitan
   * llamadas por minuto y lanzar seis clips a la vez los hacía fallar por cupo.
   * Ahora todas las llamadas pasan por una cola que respeta ese tope **sumando
   * lo que manda toda la plataforma** y que reenvía sola lo que choca, así que
   * el trabajo de no pasarse ya no es de aquí.
   *
   * Lo que se gana: seis imágenes que no dependen entre sí tardaban seis veces
   * lo que tarda una. Ahora tardan lo que tarde la más lenta, y el tope lo pone
   * quien sabe cuál es.
   */
  for (;;) {
    const ready = readyNow(flow, new Set([...results.keys(), ...broken]))
      .filter((nodeId) => !results.has(nodeId) && !broken.has(nodeId))
      .filter((nodeId) => {
        /*
         * Un nodo cuyo padre falló no se intenta.
         *
         * Sin esto se lanza igualmente, falla por falta de entrada y suma un
         * error más que confunde: el que importa es el primero, y los demás son
         * su eco.
         */
        const parents = [...inputsOf(flow, nodeId).values()].flat();
        const orphan = parents.some((parent) => !results.has(parent));

        if (orphan) {
          broken.add(nodeId);
          failed.push({ nodeId, problem: "No se intentó: falló algo de lo que depende." });
        }

        return !orphan;
      });

    if (ready.length === 0) break;

    wave += 1;

    await ctx.report(
      ready.length > 1
        ? `Paso ${done + 1} y ${ready.length - 1} más a la vez (${ready.join(", ")})`
        : `Paso ${done + 1} de ${sequence.length}`,
    );

    /*
     * Se lanzan todas y se espera a todas.
     *
     * `Promise.all` cortaría en el primer fallo y dejaría las demás corriendo
     * sin recoger: pagadas y tiradas. Con `allSettled` se recogen todas y cada
     * una guarda lo suyo.
     */
    const outcomes = await Promise.allSettled(
      ready.map(async (nodeId) => {
        const node = flow.nodes.find((item) => item.id === nodeId)!;
        const result = await runNode(
          node,
          gather(flow, nodeId, results),
          ctx,
          sources(flow, nodeId),
        );

        return { nodeId, result };
      }),
    );

    for (const [index, outcome] of outcomes.entries()) {
      const nodeId = ready[index];

      if (outcome.status === "fulfilled") {
        results.set(nodeId, outcome.value.result);
        await saveOutput({ runId: ctx.runId, nodeId, ...outcome.value.result });
        done += 1;
        continue;
      }

      const problem =
        outcome.reason instanceof Error ? outcome.reason.message : "falló";

      broken.add(nodeId);
      failed.push({ nodeId, problem });
      await saveOutput({ runId: ctx.runId, nodeId, kind: "texto", error: problem });
    }

    // Un flujo con un ciclo que se coló no puede dar oleadas infinitas.
    if (wave > flow.nodes.length + 1) break;
  }

  return { done, total: sequence.length, failed };
}
