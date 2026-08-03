"use server";

import { revalidatePath } from "next/cache";
import { runInBackground, runStep, type StepContext } from "@/lib/background";
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
  findVideoModel,
  NEGATIVE_PROMPT,
  deriveCuts,
  keyframePrompt,
  motionPrompt,
  showsProduct,
  planDurations,
  reviewShots,
  type Shot,
  type ShotRole,
} from "@/lib/video/shots";
import { buildTimeline } from "@/lib/video/timeline";
import { buildSrt, captionPieces } from "@/lib/video/captions";
import { MUSIC_GAIN, attenuateWav, buildMusicPrompt } from "@/lib/video/wav-gain";
import {
  animate,
  compose,
  keyframe,
  listVoices,
  burnSubtitles,
  makeMusic,
  mergeVideos,
  speak,
  trimClip,
} from "@/lib/video/providers";
import { uploadVideoAsset } from "@/lib/data/video-assets";
import type { JobOutcome } from "@/lib/background";
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

export async function createVideoFromCopyAction(
  input: unknown,
  ctx?: StepContext,
): Promise<LaunchResult> {
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

  return runStep(ctx, {
    productId,
    kind: "imagenes",
    label: `Guion de vídeo · ${copy.driverLabel}`,
    work: async (report) => {
      await report("Fijando el estilo visual");
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

      await report("Escribiendo el guion");

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
        /*
         * El número lo pone la posición, **nunca el modelo**.
         *
         * Es la clave con la que se emparejan la toma, su corte de voz y su
         * clip. Si el modelo devuelve dos veces el mismo —y lo hace— el mapa de
         * clips se queda con el último y **todas las tomas acaban apuntando a
         * ese**: el vídeo repite el mismo plano de principio a fin.
         *
         * Nada se gana dejándoselo elegir, y esto se lleva por delante toda esa
         * clase de fallo.
         */
        n: String(index + 1).padStart(2, "0"),
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
        videoModel: findVideoModel(readText(raw.videoModel)).id,
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
export async function generateVoiceAction(
  input: unknown,
  ctx?: StepContext,
): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  if (!videoId || !productId) throw new Error("Falta el vídeo.");
  await guard();

  const video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");
  if (video.shots.length === 0) throw new Error("El vídeo no tiene tomas.");

  return runStep(ctx, {
    productId,
    kind: "imagenes",
    label: `Voz · ${video.title}`,
    work: async (report) => {
      await report("Generando la voz toma a toma");
      const text = video.shots.map((shot) => shot.guion).join(" ");

      const voice = await speak({ text, voiceId: video.voiceId });

      await report("Guardando el audio");

      const audioUrl = await uploadVideoAsset({
        videoId,
        name: "voz.mp3",
        data: voice.audio,
        contentType: "audio/mpeg",
      });

      await report("Calculando los cortes de cada toma");

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
export async function generateKeyframesAction(
  input: unknown,
  ctx?: StepContext,
): Promise<LaunchResult> {
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
  const product = await findProductAnywhere(productId);

  /*
   * La foto del envase, y si no la hay aquí, la de tu Shopify.
   *
   * Sin ella la toma de producto sale con un frasco liso —a propósito, porque
   * una etiqueta inventada se lee como real— pero eso es un vídeo a medias. La
   * tienda ya tiene fotos del producto y son permanentes, así que sirven igual
   * de referencia.
   */
  let productShot: { url: string } | undefined =
    images.find((image) => image.isPrimary) ?? images[0];

  if (!productShot && product?.storeId) {
    try {
      const { findStore } = await import("@/lib/store-registry");
      const { listShopProducts } = await import("@/lib/shopify-store");

      const store = await findStore(product.storeId);

      if (store) {
        const found = await listShopProducts(store, { search: product.name, limit: 5 });
        const shopImage = found.flatMap((item) => item.images)[0];
        if (shopImage) productShot = { url: shopImage.url };
      }
    } catch {
      // Quedarse sin referencia no puede impedir generar el resto de tomas.
    }
  }

  /*
   * Si hacen falta fotos del envase y no las hay, se para **antes** de gastar.
   *
   * Antes se generaba igualmente con un frasco liso y se cobraba. Y es peor de
   * lo que suena: la imagen queda convincente, se anima, se monta, y el envase
   * equivocado se descubre viendo el vídeo terminado — con todo pagado.
   */
  const necesitanEnvase = pending.filter((shot) => showsProduct(shot, product?.name));

  if (!productShot && necesitanEnvase.length > 0) {
    return {
      started: false,
      message: `${necesitanEnvase.length} de las ${pending.length} tomas enseñan el envase (${necesitanEnvase
        .map((shot) => shot.n)
        .join(", ")}) y este producto no tiene imagen principal. Súbela en la pestaña Imágenes y márcala como principal: sin ella el envase saldría inventado.`,
    };
  }

  return runStep(ctx, {
    productId,
    kind: "imagenes",
    label: `Keyframes · ${video.title}`,
    work: async (report, cancelled) => {
      let done = 0;
      let stopped = false;
      const failures: string[] = [];

      for (const [index, shot] of pending.entries()) {
        /*
         * Se mira entre tomas, no en medio.
         *
         * La que está a medias ya está pagada, así que se termina y se guarda.
         * Las que faltan ni se empiezan, y volver a lanzarlo solo hace esas.
         */
        if (await cancelled()) {
          stopped = true;
          break;
        }

        await report(`Toma ${shot.n} — ${index + 1} de ${pending.length}`);

        try {
          const url = await keyframe({
            prompt: keyframePrompt(
              shot,
              { render: video.styleRender, accent: video.styleAccent },
              { name: product?.name ?? "", hasReference: Boolean(productShot) },
            ),
            /*
             * La foto real va a **toda** toma donde salga el envase.
             *
             * Antes solo iba a la de papel «producto», y un anuncio mete el
             * frasco en media escena: sobre la mesa del laboratorio, al lado de
             * las placas, flotando bajo el órgano. En todas esas se inventaba un
             * envase con su etiqueta, que queda convincente y no se nota hasta
             * compararlo con el bote de verdad.
             *
             * Donde no sale el envase no se manda: una referencia de más lo
             * cuela en una escena donde no pinta nada.
             */
            references:
              showsProduct(shot, product?.name) && productShot ? [productShot.url] : [],
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

      const head = stopped ? "Cancelado. " : "";

      /*
       * Si falta la foto del producto se dice, y aquí importa de verdad.
       *
       * Sin ella la toma de producto sale con un frasco liso a propósito —una
       * etiqueta inventada se lee como real y no se detecta hasta comparar con
       * el bote de verdad, con el vídeo ya montado y pagado—.
       */
      const conEnvase = necesitanEnvase.length;

      const conFoto = conEnvase > 0 ? ` ${conEnvase} llevan tu envase de referencia.` : "";

      return {
        summary:
          failures.length > 0
            ? `${head}${done} imagen(es) listas, ${failures.length} fallaron. ${failures[0]}${conFoto}`
            : `${head}${done} imagen(es) listas.${conFoto} Míralas antes de animar.`,
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
export async function generateClipsAction(
  input: unknown,
  ctx?: StepContext,
): Promise<LaunchResult> {
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

  /*
   * El modelo sale del vídeo, no de quien pulsa.
   *
   * Reanimar una toma suelta con otro modelo la dejaría con distinto aspecto que
   * las de al lado, y eso se ve justo en el corte.
   */
  const modelo = findVideoModel(video.videoModel);

  const plans = planDurations(
    pending.map((shot) => ({
      n: shot.n,
      start: shot.cutStart ?? 0,
      end: shot.cutEnd ?? 0,
      guion: shot.guion,
    })),
    undefined,
    modelo.billing,
    modelo.maxSeconds,
  );

  return runStep(ctx, {
    productId,
    kind: "imagenes",
    label: `Clips · ${video.title}`,
    work: async (report, cancelled) => {
      let done = 0;
      let seconds = 0;
      let stopped = false;
      const failures: string[] = [];

      for (const [index, shot] of pending.entries()) {
        const plan = plans.find((item) => item.n === shot.n);
        if (!plan) continue;

        /*
         * Aquí la parada es la que más vale: animar es casi todo el gasto de un
         * vídeo. Cancelar a mitad ahorra las tomas que faltan de verdad.
         */
        if (await cancelled()) {
          stopped = true;
          break;
        }

        await report(`Animando la toma ${shot.n} — ${index + 1} de ${pending.length}`);

        try {
          const url = await animate({
            imageUrl: shot.keyframeUrl!,
            prompt: motionPrompt(shot),
            seconds: plan.request,
            model: modelo.slug,
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
        addSpent: seconds * modelo.usdPerSecond,
      });

      const head = stopped ? "Cancelado. " : "";

      /*
       * Cuántos clips **distintos** salieron.
       *
       * Es el número que hacía falta y no estaba: un vídeo que repite un plano
       * de principio a fin puede venir de dos sitios muy distintos —el montador
       * pierde los planos, o las tomas ya apuntaban al mismo archivo— y desde el
       * vídeo terminado tienen la misma pinta. Contándolo aquí se sabe en el
       * acto cuál de los dos es.
       */
      const actual = await readVideo(videoId);
      const distintos = new Set(
        (actual?.shots ?? []).map((shot) => shot.clipUrl).filter(Boolean),
      ).size;

      const conClip = (actual?.shots ?? []).filter((shot) => shot.clipUrl).length;

      const repetidos =
        conClip > distintos
          ? ` OJO: ${conClip} tomas comparten ${distintos} clip(s) distintos, así que el montaje repetiría planos. Vuelve a animar las repetidas.`
          : "";

      return {
        summary:
          failures.length > 0
            ? `${head}${done} clip(s) listos, ${failures.length} fallaron. ${failures[0]}${repetidos}`
            : `${head}${done} clip(s) listos (${distintos} distintos), ${seconds} s generados.${repetidos}`,
      };
    },
  });
}

/** El estilo de subtítulo del vídeo. Vacío deja el vídeo sin texto. */
export async function setSubtitlePresetAction(
  videoId: unknown,
  productId: unknown,
  preset: unknown,
): Promise<void> {
  const id = readText(videoId);
  const product = readText(productId);
  if (!id) return;

  await updateVideo(id, { subtitlePreset: readText(preset) });
  if (product) revalidatePath(`/products/${product}`);
}

/* ------------------------------ La música ---------------------------------- */

/**
 * Sube la música de fondo de un vídeo.
 *
 * **Tiene que venir ya baja de volumen.** El montaje no tiene control de
 * volumen: una pista a nivel normal tapa la voz y el anuncio deja de entenderse,
 * y eso no hay forma de arreglarlo desde aquí. Se avisa donde se sube, que es
 * cuando sirve de algo saberlo.
 */
export async function uploadMusicAction(form: FormData): Promise<{ ok: boolean; message: string }> {
  const videoId = readText(form.get("videoId"));
  const productId = readText(form.get("productId"));
  const file = form.get("music");

  if (!videoId || !productId) return { ok: false, message: "Falta el vídeo." };

  // Quitarla es tan legítimo como ponerla: sin archivo se deja el vídeo sin música.
  if (!(file instanceof File) || file.size === 0) {
    await updateVideo(videoId, { musicUrl: "" });
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: "Vídeo sin música de fondo." };
  }

  if (!/^audio\//.test(file.type)) {
    return { ok: false, message: "Eso no es un archivo de audio." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, message: "La música pesa más de 25 MB." };
  }

  try {
    const url = await uploadVideoAsset({
      videoId,
      name: "musica.mp3",
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });

    await updateVideo(videoId, { musicUrl: url });
    revalidatePath(`/products/${productId}`);

    return {
      ok: true,
      message: "Música puesta. Comprueba en el montaje que no tapa la voz: no hay control de volumen.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo subir." };
  }
}

/**
 * Genera la música de fondo a medida del anuncio.
 *
 * Se le baja el volumen **antes de guardarla**, no al mezclar: el montaje mezcla
 * sin control de volumen y una pista a nivel de canción tapa la voz, que es el
 * único fallo que hace inútil un vídeo entero.
 */
export async function generateMusicAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  const mood = readText(raw.mood);

  if (!videoId || !productId) throw new Error("Falta el vídeo.");
  await guard();

  const video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  // La duración sale de la voz: una cama más corta deja el final en silencio.
  const seconds = Math.max(10, Math.ceil(video.voiceSeconds || 30));

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Música · ${video.title}`,
    resume: { videoId, productId, mood },
    work: async (report) => {
      await report(`Componiendo ${seconds} s de cama musical`);

      const { url } = await makeMusic({
        prompt: buildMusicPrompt({
          productName: product.name,
          audience: product.targetAudience || "el público objetivo",
          mood,
        }),
        seconds,
      });

      await report("Bajándole el volumen para que no tape la voz");

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo descargar la música generada.");

      const quiet = attenuateWav(new Uint8Array(await response.arrayBuffer()));

      const stored = await uploadVideoAsset({
        videoId,
        name: "musica.wav",
        data: Buffer.from(quiet),
        contentType: "audio/wav",
      });

      await updateVideo(videoId, { musicUrl: stored });

      return {
        summary: `Cama de ${seconds} s puesta, al ${Math.round(MUSIC_GAIN * 100)} % de volumen para que no tape la voz.`,
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
export async function assembleVideoAction(
  input: unknown,
  ctx?: StepContext,
): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const videoId = readText(raw.videoId);
  const productId = readText(raw.productId);
  if (!videoId || !productId) throw new Error("Falta el vídeo.");

  let video = await readVideo(videoId);
  if (!video) throw new Error("Ese vídeo ya no existe.");
  if (!video.voiceUrl) throw new Error("Falta la voz: sin ella no hay tiempos que montar.");

  const withClip = video.shots.filter((shot) => shot.clipUrl || shot.lipsyncUrl);
  if (withClip.length === 0) throw new Error("No hay ningún clip que montar.");

  /*
   * Dos tomas con el mismo número no se pueden montar.
   *
   * El número es la clave que une la toma con su corte y con su clip, así que
   * repetido hace que varias tomas resuelvan al mismo vídeo — y el montaje sale
   * repitiendo un plano de principio a fin.
   *
   * Los guiones nuevos ya no pueden traerlo: el número lo pone la posición. Esto
   * es para los que se escribieron antes, que si no fallarían siempre igual y
   * sin decir por qué.
   */
  const repetidos = video.shots
    .map((shot) => shot.n)
    .filter((n, index, all) => all.indexOf(n) !== index);

  if (repetidos.length > 0) {
    /*
     * Se renumeran en vez de rechazar el vídeo.
     *
     * El número **es** la posición: no lleva información que se pueda perder al
     * reasignarlo. Y los clips y los cortes cuelgan de la fila de cada toma, no
     * del número, así que renumerar arregla el montaje sin volver a generar ni
     * pagar nada — que es lo contrario de mandar a reescribir el guion.
     */
    for (const [index, shot] of video.shots.entries()) {
      const next = String(index + 1).padStart(2, "0");
      if (shot.n !== next) await updateShot(shot.id, { n: next });
    }

    video = (await readVideo(videoId))!;
  }

  /*
   * Una toma sin corte no entra en el montaje, y eso se avisa **antes**.
   *
   * El corte sale de encontrar la frase de la toma dentro del audio. Cuando no
   * se encuentra —el texto se corrigió después de grabar la voz, o el generador
   * pronunció distinto— esa toma se queda sin tiempos y desaparece del montaje.
   *
   * Si desaparecen casi todas queda un clip cubriendo el vídeo entero, que es
   * exactamente lo que parece un montaje roto. Y no había nada que lo dijera:
   * salía un vídeo, solo que con una escena sola.
   */
  const sinCorte = withClip.filter((shot) => shot.cutStart === null || shot.cutEnd === null);

  if (sinCorte.length > 0 && withClip.length - sinCorte.length < 2) {
    return {
      started: false,
      message: `Solo ${withClip.length - sinCorte.length} de ${withClip.length} tomas tienen sus tiempos: el vídeo saldría con una sola escena. Las tomas ${sinCorte
        .map((shot) => shot.n)
        .join(", ")} no se encontraron en el audio — vuelve a generar la voz para que los tiempos cuadren con el guion actual.`,
    };
  }

  return runStep(ctx, {
    productId,
    kind: "imagenes",
    label: `Montaje · ${video.title}`,
    work: async (report) => {
      // El montaje es una sola llamada larga, así que no hay pasos que contar:
      // decir que está esperando ya evita pensar que se colgó.
      await report("Montando el vídeo: esto tarda un rato");

      const timeline = buildTimeline({
        musicUrl: video.musicUrl || undefined,
        // Sin esto, la imagen se acaba con el último corte y el resto queda en
        // negro mientras la voz sigue sonando.
        voiceSeconds: video.voiceSeconds || undefined,
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

      /*
       * Cuántos planos **distintos** entran, no cuántas pistas.
       *
       * Es el número que delata el fallo que costó varias vueltas: el montaje
       * salía repitiendo un solo clip, y desde fuera parecía un vídeo normal.
       * Con esto en el resumen, ese caso se ve sin abrir el vídeo.
       */
      const planos = new Set(
        timeline.tracks
          .filter((track) => track.type === "video")
          .flatMap((track) => track.keyframes.map((frame) => frame.url)),
      ).size;

      if (planos === 1 && withClip.length > 1) {
        throw new Error(
          `Solo un plano distinto para ${withClip.length} tomas: el montaje habría salido repitiendo el mismo. Revisa que cada toma tenga su clip.`,
        );
      }

      /*
       * Los planos se recortan y se encadenan **antes** del montaje.
       *
       * Es el arreglo del fallo que costó varias vueltas: pasarle los seis
       * planos al montaje para que los colocara daba un vídeo con el último
       * repetido de principio a fin, aunque los seis clips fueran distintos y
       * estuvieran bien. Recortando cada uno por separado —una llamada con un
       * solo plano dentro, que no tiene nada que encadenar— y pegándolos con el
       * unificador, no queda ninguna semántica que adivinar.
       */
      const frames = timeline.tracks
        .filter((track) => track.type === "video")
        .flatMap((track) => track.keyframes);

      await report(`Recortando ${frames.length} plano(s)`);

      const trimmed: string[] = [];

      for (const [index, frame] of frames.entries()) {
        await report(`Recortando plano ${index + 1} de ${frames.length}`);
        trimmed.push(await trimClip(frame.url, frame.duration / 1000));
      }

      await report("Encadenando los planos");

      const picture = await mergeVideos(trimmed);

      await report("Pegando la voz, la música y los subtítulos");

      const result = await compose([
        // Un solo plano, ya con todo dentro: el caso que sí se comporta.
        {
          id: "broll",
          type: "video",
          keyframes: [{ timestamp: 0, duration: Math.round(timeline.seconds * 1000), url: picture }],
        },
        ...timeline.tracks.filter((track) => track.type !== "video"),
      ]);

      /*
       * Los subtítulos se queman al final, sobre el vídeo ya montado.
       *
       * Se le da el SRT hecho con **nuestro** texto y nuestros tiempos: el
       * servicio sabe transcribir él solo, pero el guion va fonético para que la
       * voz pronuncie bien y escribiría «eme ce te» donde va «MCT».
       *
       * Antes se dibujaban aquí como imágenes y se apilaban en el montaje. Salía
       * un subtítulo correcto y quieto; este anima palabra a palabra, que es lo
       * que hace que se lean sin querer.
       */
      let finalUrl = result.videoUrl;
      let subtitulos = "";

      if (video.subtitlePreset) {
        await report("Quemando los subtítulos");

        const srt = buildSrt(
          video.shots.flatMap((shot) =>
            shot.cutStart === null || shot.cutEnd === null
              ? []
              : captionPieces({
                  written: shot.sub?.trim() || shot.guion,
                  start: shot.cutStart,
                  end: shot.cutEnd,
                }),
          ),
        );

        if (srt.trim()) {
          try {
            finalUrl = await burnSubtitles({
              videoUrl: result.videoUrl,
              srt,
              preset: video.subtitlePreset,
            });

            subtitulos = `, subtítulos «${video.subtitlePreset}»`;
          } catch (error) {
            /*
             * Un fallo aquí no tira el vídeo: ya está montado y se ve entero.
             * Pero se dice — un `catch` mudo fue lo que convirtió la vez pasada
             * un problema de una línea en media hora de buscar.
             */
            subtitulos = `. Sin subtítulos: ${error instanceof Error ? error.message : "falló"}`;
          }
        }
      }

      await updateVideo(videoId, {
        status: "montado",
        finalUrl,
        thumbnailUrl: result.thumbnailUrl,
      });

      return {
        summary:
          timeline.missing.length > 0
            ? `Montado, ${timeline.seconds} s con ${planos} de ${withClip.length} tomas. Faltaron ${timeline.missing.join(", ")}: sin tiempos no entran, y las de al lado se estiran para cubrirlas.`
            : `Montado, ${timeline.seconds} s con ${planos} plano(s) distintos${subtitulos}${video.musicUrl ? " y música" : ""}.`,
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

/* --------------------------- El vídeo entero, de una ----------------------- */

/**
 * Escribe el guion, pone la voz, genera las imágenes y —si se pide— anima y monta.
 *
 * ## Un solo trabajo, no cinco
 *
 * Encadenar los pasos dentro del mismo trabajo es lo que permite mirar una sola
 * línea y saber en qué punto va el vídeo. Cinco trabajos seguidos serían cinco
 * filas y ninguna diría cuánto falta para tener algo que ver.
 *
 * No duplica ni una línea de los pasos sueltos: los llama a ellos. El mismo
 * código sirve para el botón de cada paso y para este.
 *
 * ## Por qué por defecto se para antes de animar
 *
 * Es la parada que más dinero ahorra de todo el pipeline, y no es una opinión:
 * regenerar un keyframe malo cuesta unos dos céntimos; dejarlo pasar cuesta la
 * toma animada entera —entre diez céntimos y noventa— más el rato de rehacerla.
 * Mirar seis imágenes lleva medio minuto y evita pagar dos veces lo caro.
 *
 * Quien quiera el vídeo entero sin mirar lo dice, y entonces sigue hasta el
 * final. Pero se para por defecto porque el descuido caro es el otro.
 */
export async function runFullVideoAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const copyId = readText(raw.copyId);
  const voiceId = readText(raw.voiceId);
  const stopBeforeClips = raw.stopBeforeClips !== false;

  if (!productId || !copyId) throw new Error("Falta el copy.");
  if (!voiceId) throw new Error("Elige una voz.");
  await guard();

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  return runInBackground({
    productId,
    kind: "imagenes",
    label: stopBeforeClips ? "Vídeo hasta las imágenes" : "Vídeo completo",
    resume: { productId, copyId, voiceId, stopBeforeClips },
    work: async (report, cancelled) => {
      const outcomes: JobOutcome[] = [];

      const ctx: StepContext = {
        report,
        cancelled,
        collect: (outcome) => outcomes.push(outcome),
        jobId: "",
        label: "paso",
      };

      const last = () => outcomes[outcomes.length - 1];

      /*
       * Entre pasos se mira si han pedido parar.
       *
       * El paso que esté a medias ya está pagado, así que se termina; el
       * siguiente no se empieza. Y lo hecho queda guardado en el vídeo, así que
       * se puede seguir a mano desde donde se quedó.
       */
      const detenido = async (): Promise<boolean> => cancelled();

      await report("1 de 5 · Escribiendo el guion");
      await createVideoFromCopyAction(
        { productId, copyId, voiceId, shots: raw.shots, seconds: raw.seconds, referenceId: raw.referenceId },
        ctx,
      );

      const videoId = (last()?.result as { videoId?: string } | undefined)?.videoId;
      if (!videoId) throw new Error("El guion no llegó a guardarse.");

      const cerrar = (extra: string) => ({
        summary: [
          outcomes
            .map((outcome) => outcome.summary)
            .filter(Boolean)
            .join(" · "),
          extra,
        ]
          .filter(Boolean)
          .join(" — "),
        result: { videoId },
        inputTokens: outcomes.reduce((sum, o) => sum + (o.inputTokens ?? 0), 0),
        outputTokens: outcomes.reduce((sum, o) => sum + (o.outputTokens ?? 0), 0),
      });

      if (await detenido()) return cerrar("Cancelado tras el guion.");

      await report("2 de 5 · Poniendo la voz");
      await generateVoiceAction({ productId, videoId }, ctx);

      if (await detenido()) return cerrar("Cancelado tras la voz.");

      await report("3 de 5 · Generando las imágenes");
      await generateKeyframesAction({ productId, videoId }, ctx);

      if (stopBeforeClips) {
        return cerrar(
          "Parado antes de animar, que es donde está el gasto. Mira las imágenes y sigue desde el vídeo.",
        );
      }

      if (await detenido()) return cerrar("Cancelado antes de animar.");

      await report("4 de 5 · Animando las tomas");
      await generateClipsAction({ productId, videoId }, ctx);

      if (await detenido()) return cerrar("Cancelado antes del montaje.");

      await report("5 de 5 · Montando el vídeo");
      await assembleVideoAction({ productId, videoId }, ctx);

      return cerrar("");
    },
  });
}
