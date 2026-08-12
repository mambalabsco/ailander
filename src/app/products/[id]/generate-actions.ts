"use server";

import { revalidatePath } from "next/cache";
import { findProductAnywhere } from "@/lib/products";
import { findStore, listStores } from "@/lib/store-registry";
import { readProductResearch, saveProductHooks } from "@/lib/research-store";
import { readAngles, readCopies, saveAngles, saveCopies } from "@/lib/copy-store";
import { readOffers } from "@/lib/data/products";
import { listNotes } from "@/lib/data/notes";
import { readPerformance, rollUpByAngle } from "@/lib/performance-store";
import {
  nextNumbers,
  readCampaignTrees,
  readPrelandings,
  saveAdset,
  saveCampaign,
  saveShortAds,
} from "@/lib/campaign-store";
import { marketMoney } from "@/lib/money";
import { marketContextFor } from "@/lib/market-context";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { clampToLimit, generateLongCopy, generateStructured } from "@/lib/generators";
import {
  ANGLES_SCHEMA,
  COMPETITOR_SEARCH_SCHEMA,
  LONG_COPY_SCHEMA,
  HOOKS_SCHEMA,
  IDEAS_SCHEMA,
  PRODUCT_ANALYSIS_SCHEMA,
  SHORT_ADS_SCHEMA,
} from "@/lib/generation-schemas";
import {
  buildAdvertorialPrompt,
  buildAnglesPrompt,
  buildCompetitorSearchPrompt,
  buildLongCopyPrompt,
} from "@/lib/copy-prompts";
import { buildShortAdBatchPrompt } from "@/lib/short-ad-prompts";
import { buildIdeasPrompt } from "@/lib/idea-prompts";
import { buildProductAnalysisPrompt } from "@/lib/product-analysis-prompt";
import { buildAdaptPrompt } from "@/lib/adapt-prompt";
import { buildHookPlan, HOOKS_PER_BATCH } from "@/lib/hook-plan";
import { AWARENESS_LABELS } from "@/types/research";
import type { AwarenessLevel, ProductHook } from "@/types/research";
import { FACEBOOK_LIMITS, findCopyMethod } from "@/types/copy";
import type { CopyFormat, GeneratedCopy, MarketingAngle } from "@/types/copy";
import { buildAdName, buildAdsetName, buildCampaignName } from "@/types/campaign";
import type { AdSet, FunnelStage, ShortAd, ShortAdFormat } from "@/types/campaign";
import { emptyOffers } from "@/types/offer";
import { estimateCost } from "@/lib/claude";
import { runInBackground, type JobOutcome } from "@/lib/background";
import { recordRun } from "@/lib/data/runs";
import type { JobKind, LaunchResult } from "@/types/jobs";

/**
 * Acciones de generación con IA.
 *
 * **Todas gastan dinero**, así que todas comprueban lo mismo antes de llamar:
 * que haya clave, que el producto exista y que estén los datos de los que
 * depende la generación. Un copy sin ángulo o unos ganchos sin investigación
 * cuestan igual y salen genéricos.
 *
 * Devuelven siempre el gasto medido —tokens y coste— porque una plataforma que
 * llama a un modelo de pago sin decir cuánto costó cada botón es una forma
 * cómoda de tener una sorpresa a fin de mes.
 */

export interface GenerationResult {
  ok: boolean;
  created: number;
  message: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/*
 * `LaunchResult` **no se reexporta desde aquí**, y no es un olvido.
 *
 * En un módulo `"use server"` Next recorre los exports para crear una
 * referencia de acción por cada uno. Un tipo reexportado no existe en tiempo de
 * ejecución, así que esa referencia apunta a nada y la página revienta con
 * «LaunchResult is not defined» — al pulsar el botón, no al compilar, porque el
 * build no tiene forma de verlo.
 *
 * Quien necesite el tipo lo toma de `@/types/jobs`, que es un módulo normal.
 */

/** No había nada que generar. Se dice y no se cobra. */
function nothingToDo(message: string): LaunchResult {
  return { started: false, message };
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Comprobaciones comunes: sin esto cada acción repetiría lo mismo mal. */
async function context(productId: unknown) {
  const id = readText(productId);
  if (!id) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const product = await findProductAnywhere(id);
  if (!product) throw new Error("No se encontró el producto.");

  const [research, stores] = await Promise.all([readProductResearch(id), listStores()]);
  const store = product.storeId ? await findStore(product.storeId) : null;

  const [offers, notes, swipeCopies] = await Promise.all([
    readOffers(id).catch(() => emptyOffers()),
    listNotes(id).catch(() => []),
    /*
     * Los ya probados **de este producto** y los sin producto.
     *
     * Antes entraban también los de otros productos, con el argumento de que el
     * patrón de un copy que convirtió sirve igual. El patrón sí; el contenido
     * no: un advertorial de Ozempic entrando como referencia en un producto de
     * tiroides arrastra su tema, y el copy nuevo sale hablando de lo que no es.
     */
    import("@/lib/data/swipe")
      .then((module) => module.listSwipeCopies(id))
      .catch(() => []),
  ]);

  const { describeSwipeCopies } = await import("@/lib/data/swipe");

  return {
    id,
    product,
    research,
    store,
    offers,
    notes,
    swipe: describeSwipeCopies(swipeCopies),
    currency: marketMoney(product, stores).currency,
    /*
     * El mercado se resuelve aquí, una vez, y no en cada acción.
     *
     * Son nueve las que escriben un encargo, y en la novena se olvidaría. Un
     * encargo que se olvide del mercado no falla: escribe el precio del país
     * base en un texto que iba a ir a otro sitio.
     *
     * Sin el mercado de la URL todavía: lo pasa el cliente en la tarea 9. Con un
     * solo mercado —o mientras la migración no esté aplicada— esto devuelve
     * exactamente lo de siempre.
     */
    marketContext: await marketContextFor(product),
  };
}

/**
 * Cierra un trabajo: calcula el coste y lo anota en el registro de gasto.
 *
 * Se anota aquí y no en cada acción porque son siete y en la séptima se
 * olvidaría — y una generación que no aparece en el historial es dinero que
 * gastaste sin poder verlo.
 */
async function outcome(
  role: "copy" | "research",
  kind: JobKind,
  ctx: { id: string; product: { name: string } },
  message: string,
  /*
   * Los tokens de caché viajan aparte de los de entrada.
   *
   * `generateStructured` los devuelve desde ayer y aquí se tiraban: no llegaban
   * ni a `estimateCost` ni al registro. La consecuencia es que la caché podía
   * estar ahorrando dinero de verdad y el panel seguiría enseñando el gasto de
   * antes — no hay ningún error que avise, solo el contador que nunca sube.
   */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): Promise<JobOutcome> {
  const { copyModel, researchModel } = await import("@/lib/claude");
  const model = role === "copy" ? await copyModel() : await researchModel();
  const costUsd = estimateCost(
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens ?? 0,
    usage.cacheWriteTokens ?? 0,
  );

  await recordRun({
    productId: ctx.id,
    productName: ctx.product.name,
    // El registro de gasto solo distingue cuatro familias; la ficha se
    // investiga, así que cuenta como investigación.
    kind: kind === "imagenes" ? "imagen" : kind === "ficha" ? "investigacion" : "copy",
    detail: message,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
  });

  return {
    summary: message,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
  };
}

/* ---------------------------------- Ángulos ------------------------------------- */

export async function generateAnglesAction(
  productId: unknown,
  desire: unknown,
): Promise<LaunchResult> {
  const ctx = await context(productId);
  const target = readText(desire);
  if (!target) throw new Error("Elige un deseo masivo antes de generar los ángulos.");

  if (!ctx.research.master) {
    throw new Error(
      "Los ángulos se construyen sobre el documento 4. Genera antes la investigación.",
    );
  }

  const prompt = buildAnglesPrompt({
    product: ctx.product,
    research: ctx.research,
    store: ctx.store,
    marketContext: ctx.marketContext,
    offers: ctx.offers,
    notes: ctx.notes,
    desire: target,
    count: 5,
  });

  /*
   * La comprobación de arriba es síncrona y esto no.
   *
   * Que falte el documento 4 se sabe al instante y hay que decirlo al instante;
   * la llamada al modelo tarda y se va al servidor. Mezclarlas dejaría al
   * usuario esperando a un trabajo que iba a fallar por algo ya sabido.
   */
  return runInBackground({
    productId: ctx.id,
    kind: "angulos",
    label: `Ángulos · ${target}`,
    work: async () => {
      const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = await generateStructured<{
        angles: Omit<MarketingAngle, "id" | "productId" | "desire" | "createdAt">[];
      }>({ prompt, schema: ANGLES_SCHEMA, role: "research" });

      // Se relee dentro del trabajo: entre pulsar y ejecutar pudo entrar otra
      // generación, y partir de una lista vieja borraría lo que añadió.
      const existing = await readAngles(ctx.id);

      await saveAngles(ctx.id, [
        ...existing,
        ...data.angles.map((angle) => ({
          ...angle,
          id: "",
          productId: ctx.id,
          desire: target,
          createdAt: new Date().toISOString(),
        })),
      ]);

      return outcome("research", "angulos", ctx, `${data.angles.length} ángulos nuevos.`, {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      });
    },
  });
}

/* ----------------------------------- Ganchos ------------------------------------ */

export async function generateHooksAction(
  productId: unknown,
  /**
   * Qué combinaciones generar, como `nivel::deseo`.
   *
   * Vacío significa «todas las que faltan». Antes solo hacía la primera tanda
   * pendiente y había que volver a pulsar doce veces para tener la matriz
   * completa — y dos clics seguidos generaban **la misma tanda dos veces**,
   * porque ambos leían el mismo estado antes de que ninguno guardara.
   */
  selection?: unknown,
): Promise<LaunchResult> {
  const ctx = await context(productId);

  const plan = buildHookPlan(ctx.research.awareness, ctx.research.desireValidation);
  if (!plan || plan.batches.length === 0) {
    throw new Error(
      "El plan de ganchos sale de los documentos 1 y 6. Genera antes la investigación.",
    );
  }

  const { readProductHooks } = await import("@/lib/research-store");
  const existing = await readProductHooks(ctx.id);
  const done = new Set(existing.map((hook) => `${hook.awarenessLevel}::${hook.desire}`));

  const asked = Array.isArray(selection)
    ? selection.map((item) => readText(item)).filter(Boolean)
    : [];

  /*
   * Con selección explícita se hace exactamente eso, **aunque ya esté hecho**.
   * Repetir una combinación es legítimo: da diez ganchos distintos sobre el
   * mismo nivel y deseo, que es como se llega a tener cien.
   *
   * Sin selección se hacen las que faltan, que es el atajo habitual.
   */
  const batches =
    asked.length > 0
      ? plan.batches.filter((batch) => asked.includes(`${batch.awarenessLevel}::${batch.desire}`))
      : plan.batches.filter((batch) => !done.has(`${batch.awarenessLevel}::${batch.desire}`));

  // Ni trabajo ni gasto: no hay nada que hacer y se dice.
  if (batches.length === 0) return nothingToDo("No queda ninguna combinación pendiente.");

  const { buildProductContext } = await import("@/lib/copy-prompts");
  // `productContext`, no `context`: ese nombre ya es el de la función de arriba.
  const productContext = buildProductContext(ctx.product, ctx.research, ctx.store, ctx.marketContext, {
    offers: ctx.offers,
    notes: ctx.notes,
    swipe: ctx.swipe,
  });

  /*
   * Una llamada por combinación, no una sola con todo dentro.
   *
   * Diez ganchos de un nivel y un deseo concretos caben holgadamente en una
   * respuesta; ciento veinte de doce combinaciones distintas no, y se cortarían
   * por longitud después de haberlos pagado. Además, así una combinación que
   * falle no se lleva por delante las demás.
   */
  /*
   * Solo el encargo: el contexto del producto va aparte, por la caché.
   *
   * Son hasta doce tandas seguidas con el mismo contexto delante y solo el
   * nivel de conciencia y el deseo cambiando. Pegándolo dentro del encargo, ese
   * contexto se pagaba entero doce veces; pasándolo como `context`, se paga una
   * y las once siguientes lo leen a una décima parte.
   *
   * Lo que va aquí **no puede** colarse en el contexto: en cuanto una tanda
   * cambia un byte del prefijo, no hay caché. Y no falla — se paga y ya.
   */
  const buildTask = (batch: (typeof batches)[number]) => `## Tarea

Escribe **10 ganchos** para anuncios de Facebook dirigidos a personas en el nivel de conciencia **${AWARENESS_LABELS[batch.awarenessLevel]}**, sobre este deseo masivo:

**${batch.desire}**

Cada gancho es la primera frase de un anuncio: lo que hace parar el scroll. Requisitos:

- Cada uno debe abrir por un **momento distinto**, no ser la misma idea reformulada diez veces.
- Usa el lenguaje real del cliente que aparece en la investigación, no lenguaje de marca.
- Nada de promesas que la investigación no sostenga.
- El **título** es el gancho en sí (una frase). El **cuerpo** son las dos o tres líneas que lo continúan.
- En **ángulo**, di en pocas palabras desde qué lente entra ese gancho.
- En **formato**, di de qué tipo es: pregunta, afirmación contraintuitiva, escena, dato, confesión, comparación…`;

  return runInBackground({
    productId: ctx.id,
    kind: "ganchos",
    label:
      batches.length === 1
        ? `Ganchos · ${AWARENESS_LABELS[batches[0].awarenessLevel]}`
        : `${batches.length * HOOKS_PER_BATCH} ganchos · ${batches.length} combinaciones`,
    work: async () => {
      const batchId = `lote-${Date.now().toString(36)}`;

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      let created = 0;
      const failures: string[] = [];

      /*
       * Una detrás de otra, no en paralelo.
       *
       * Doce llamadas simultáneas al mismo modelo chocan con el límite por
       * minuto, y las que rebotan se pierden después de haber empezado a
       * facturar. En serie tarda más y termina entero.
       */
      for (const batch of batches) {
        try {
          const result = await generateStructured<{
            hooks: { title: string; body: string; angle: string; format: string }[];
          }>({
            prompt: buildTask(batch),
            context: productContext,
            schema: HOOKS_SCHEMA,
            role: "copy",
          });

          inputTokens += result.inputTokens;
          outputTokens += result.outputTokens;
          cacheReadTokens += result.cacheReadTokens;
          cacheWriteTokens += result.cacheWriteTokens;

          const hooks: ProductHook[] = result.data.hooks.map((hook) => ({
            id: "",
            productId: ctx.id,
            title: hook.title,
            body: hook.body,
            awarenessLevel: batch.awarenessLevel,
            desire: batch.desire,
            angle: hook.angle,
            format: hook.format,
            isUsed: false,
            createdAt: new Date().toISOString(),
            batchId,
          }));

          // Se guarda al terminar cada combinación, no al final de todas: si la
          // séptima falla, las seis anteriores ya están a salvo y pagadas.
          await saveProductHooks(ctx.id, hooks);
          created += hooks.length;
        } catch (error) {
          failures.push(
            `${AWARENESS_LABELS[batch.awarenessLevel]} · ${batch.desire}: ${
              error instanceof Error ? error.message : "error desconocido"
            }`,
          );
        }
      }

      const detail = failures.length > 0 ? ` Fallaron ${failures.length}: ${failures.join(" · ")}` : "";

      return outcome(
        "copy",
        "ganchos",
        ctx,
        `${created} ganchos en ${batches.length - failures.length} combinación(es).${detail}`,
        { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      );
    },
  });
}

/* ------------------------------------ Copys -------------------------------------- */

export async function generateCopyAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ctx = await context(raw.productId);

  const format = readText(raw.format) as CopyFormat;
  const methodId = readText(raw.methodId);
  const method = findCopyMethod(methodId);
  if (!method) throw new Error("Ese método de escritura no existe.");

  const awarenessLevel = readText(raw.awarenessLevel) as AwarenessLevel;
  const driver = readText(raw.driver) === "angle" ? "angle" : "desire";
  const desire = readText(raw.desire);
  const angleId = readText(raw.angleId);

  const angles = await readAngles(ctx.id);
  const angle = angles.find((item) => item.id === angleId);

  if (driver === "angle" && !angle) {
    throw new Error("Elige un ángulo antes de generar.");
  }
  if (driver === "desire" && !desire) {
    throw new Error("Elige un deseo masivo antes de generar.");
  }

  /*
   * El gancho de apertura elegido.
   *
   * **Estaba desconectado.** El selector existía en la pantalla, el prompt sabía
   * recibirlo —`longs.md` lo pide como primera frase del anuncio— y el id no se
   * enviaba nunca. Elegías un gancho y el modelo escribía otro.
   */
  const hookId = readText(raw.hookId);
  let chosenHook: ProductHook | null = null;

  if (hookId) {
    const { readProductHooks } = await import("@/lib/research-store");
    chosenHook = (await readProductHooks(ctx.id)).find((item) => item.id === hookId) ?? null;
  }

  const shared = {
    product: ctx.product,
    research: ctx.research,
    store: ctx.store,
    marketContext: ctx.marketContext,
    offers: ctx.offers,
    notes: ctx.notes,
    swipe: ctx.swipe,
    method,
    awarenessLevel,
    desire: desire || angle?.desire || "",
    angle,
    hook: chosenHook?.title,
  };

  const prompt = `${
    format === "advertorial" ? buildAdvertorialPrompt(shared) : buildLongCopyPrompt(shared)
  }

---

## Título y descripción de Facebook

Ningún prompt de este documento los genera, pero el gestor de anuncios los exige. Devuélvelos junto al cuerpo:

- **Título**: máximo ${FACEBOOK_LIMITS.headline} caracteres. Es la promesa o el mecanismo en una línea.
- **Descripción**: máximo ${FACEBOOK_LIMITS.description} caracteres. Remata el título, no lo repite.`;

  return runInBackground({
    productId: ctx.id,
    kind: "copys",
    label: `Copy · ${method.name}`,
    work: async () => {
  /*
   * Las palabras se cuentan aquí, no las declara el modelo.
   *
   * Antes el esquema le pedía un `wordCount` y ese número se guardaba tal cual:
   * una pieza de cuatrocientas palabras podía declarar mil doscientas y nadie lo
   * notaba. Si sale corta, `generateLongCopy` pide una ampliación antes de
   * guardarla.
   */
  const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } =
    await generateLongCopy({
    prompt,
    schema: LONG_COPY_SCHEMA,
    range: method.wordRange,
  });

  const existing = await readCopies(ctx.id);

  const copy: GeneratedCopy = {
    id: "",
    productId: ctx.id,
    format,
    methodId,
    driver,
    driverLabel: driver === "angle" ? (angle?.name ?? "") : desire,
    angleId: angle?.id,
    awarenessLevel,
    content: {
      primaryText: data.primaryText,
      // El esquema no puede imponer longitud máxima, así que se recorta aquí:
      // un título de 45 caracteres sale con puntos suspensivos en el anuncio.
      headline: clampToLimit(data.headline, FACEBOOK_LIMITS.headline),
      description: clampToLimit(data.description, FACEBOOK_LIMITS.description),
    },
    wordCount: data.wordCount,
    status: "draft",
    createdAt: new Date().toISOString(),
  };

  await saveCopies(ctx.id, [...existing, copy]);

      /*
       * El gancho queda marcado como usado.
       *
       * Antes solo se marcaba a mano, así que la lista no reflejaba nada y había
       * que acordarse de cuál ya se había escrito. Con ciento veinte ganchos eso
       * no se recuerda.
       */
      if (chosenHook && !chosenHook.isUsed) {
        const { toggleHookUsed } = await import("@/lib/research-store");
        await toggleHookUsed(ctx.id, chosenHook.id).catch(() => null);
      }

      return outcome("copy", "copys", ctx, `${data.note}. Está en borrador.`, {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      });
    },
  });
}

/* -------------------------------- Anuncios cortos -------------------------------- */

export async function generateShortAdsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ctx = await context(raw.productId);

  const count = Math.min(20, Math.max(1, Math.round(readNumber(raw.count, 10))));
  const stage = (readText(raw.stage, "BOFU") as FunnelStage) || "BOFU";
  const angleId = readText(raw.angleId);
  const theme = readText(raw.theme);
  const focus = readText(raw.focus);
  const audience = readText(raw.audience);
  const destinationType = readText(raw.destination, "producto");
  const prelandingId = readText(raw.prelandingId);

  const [angles, prelandings, numbers] = await Promise.all([
    readAngles(ctx.id),
    readPrelandings(ctx.id),
    nextNumbers(ctx.id),
  ]);
  const angle = angles.find((item) => item.id === angleId);
  const countryCode = (ctx.product.country || "ES").slice(0, 2).toUpperCase();

  /*
   * El prompt necesita el conjunto para saber a dónde va el tráfico y con qué
   * oferta, pero el conjunto definitivo lo nombra el propio modelo. Se le pasa
   * un borrador con lo que ya se sabe y después se guarda el real.
   */
  const draftAdset: AdSet = {
    id: "",
    productId: ctx.id,
    campaignId: "",
    number: numbers.adset,
    name: buildAdsetName({ number: numbers.adset, stage, focus: focus || theme }),
    stage,
    focus: focus || theme,
    destination: {
      type: destinationType as AdSet["destination"]["type"],
      prelandingId: prelandingId || undefined,
    },
    angleId: angle?.id,
    audience: audience || ctx.product.targetAudience,
    objective: "",
    offerStack: [],
    alwaysInclude: [],
    createdAt: new Date().toISOString(),
  };

  const prompt = `${buildShortAdBatchPrompt({
    product: ctx.product,
    research: ctx.research,
    store: ctx.store,
    marketContext: ctx.marketContext,
    adset: draftAdset,
    prelandings,
    angle,
    count,
    startNumber: numbers.ad,
  })}

---

Devuelve también el nombre de la campaña y del conjunto, su audiencia, su objetivo, la escalera de precios que anclan todos los anuncios, y qué elementos no pueden faltar en ningún copy del conjunto.`;

  return runInBackground({
    productId: ctx.id,
    kind: "anuncios",
    label: `Anuncios · ${theme || ctx.product.name}`,
    work: async () => {
  const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = await generateStructured<{
        campaign: { name: string; theme: string; focus: string };
        adsets: {
          name: string;
          stage: FunnelStage;
          focus: string;
          audience: string;
          objective: string;
          offerStack: string[];
          alwaysInclude: string[];
          ads: {
            name: string;
            format: ShortAdFormat;
            primaryText: string;
            headline: string;
            description: string;
            imagePrompt: string;
          }[];
        }[];
      }>({ prompt, schema: SHORT_ADS_SCHEMA, role: "copy", maxTokens: 48_000 });

      /*
       * Una campaña, varios conjuntos, cada uno en su etapa.
       *
       * Antes cada generación creaba una campaña entera dedicada a una sola
       * etapa. Dentro de una campaña real conviven conjuntos de frío, templado y
       * caliente: la etapa es del conjunto, no de la campaña.
       */
      const savedCampaign = await saveCampaign({
        id: "",
        productId: ctx.id,
        name: buildCampaignName({
          countryCode,
          theme: data.campaign.theme || theme || ctx.product.category,
          focus: data.campaign.focus || focus,
        }),
        countryCode,
        theme: data.campaign.theme || theme,
        // La etapa de la campaña queda como la de entrada, que es la del primer
        // conjunto: el campo sigue existiendo y hay pantallas que lo leen.
        stage: data.adsets[0]?.stage ?? stage,
        focus: data.campaign.focus || focus,
        createdAt: new Date().toISOString(),
      });

      let adsetNumber = numbers.adset;
      let adNumber = numbers.ad;
      const created: { adset: string; ads: number }[] = [];

      for (const group of data.adsets) {
        const groupStage = group.stage ?? stage;

        const savedAdset = await saveAdset({
          id: "",
          productId: ctx.id,
          campaignId: savedCampaign.id,
          number: adsetNumber,
          name: buildAdsetName({
            number: adsetNumber,
            stage: groupStage,
            focus: group.focus || focus,
          }),
          stage: groupStage,
          focus: group.focus || focus,
          destination: {
            type: destinationType as AdSet["destination"]["type"],
            prelandingId: prelandingId || undefined,
          },
          angleId: angle?.id,
          audience: group.audience || audience,
          objective: group.objective,
          offerStack: group.offerStack,
          alwaysInclude: group.alwaysInclude,
          createdAt: new Date().toISOString(),
        });

        adsetNumber += 1;

        const ads: ShortAd[] = (group.ads ?? []).map((ad, index) => ({
          id: "",
          productId: ctx.id,
          adsetId: savedAdset.id,
          number: adNumber + index,
          name: buildAdName({ number: adNumber + index, format: ad.format, hook: ad.name }),
          format: ad.format,
          imagePrompt: ad.imagePrompt,
          content: {
            primaryText: ad.primaryText,
            headline: clampToLimit(ad.headline, FACEBOOK_LIMITS.headline),
            description: clampToLimit(ad.description, FACEBOOK_LIMITS.description),
          },
          createdAt: new Date().toISOString(),
        }));

        // Se guardan por conjunto: si el quinto falla, los cuatro anteriores ya
        // están, y están pagados.
        if (ads.length > 0) await saveShortAds(ads);

        adNumber += ads.length;
        created.push({ adset: savedAdset.name, ads: ads.length });
      }

      const totalAds = created.reduce((total, item) => total + item.ads, 0);

      return outcome(
        "copy",
        "anuncios",
        ctx,
        `${totalAds} anuncios en ${created.length} conjunto(s) de «${savedCampaign.name}».`,
        { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      );
    },
  });
}

/* -------------------------------- Competidores ----------------------------------- */

export interface CompetitorCandidate {
  name: string;
  url: string;
  whyItCompetes: string;
  confidence: string;
}

export async function searchCompetitorsAction(productId: unknown): Promise<LaunchResult> {
  const ctx = await context(productId);

  const prompt = buildCompetitorSearchPrompt(ctx.product, ctx.marketContext);

  return runInBackground({
    productId: ctx.id,
    kind: "competidores",
    label: `Buscar competidores de ${ctx.product.name}`,
    work: async () => {
      const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = await generateStructured<{
        competitors: CompetitorCandidate[];
      }>({
        prompt,
        schema: COMPETITOR_SEARCH_SCHEMA,
        role: "research",
        // Lo único de este grupo que necesita buscar: los competidores están en
        // la web, no en la memoria del modelo.
        webSearch: true,
      });

      const base = await outcome(
        "research",
        "competidores",
        ctx,
        `${data.competitors.length} candidatos. Revísalos y añade los que valgan al producto.`,
        { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      );

      /*
       * Los candidatos viajan en `result`, no se guardan.
       *
       * El usuario confirma cuáles entran: meterlos sin revisar contamina el
       * documento 2, que es de los caros. Y como el trabajo corre después de la
       * respuesta, el único sitio donde la interfaz puede recogerlos luego es
       * la propia fila del trabajo.
       */
      return { ...base, result: { candidates: data.competitors } };
    },
  });
}

/** Añade a la ficha los candidatos que el usuario haya aceptado. */
export async function addCompetitorUrlsAction(
  productId: unknown,
  urls: unknown,
): Promise<number> {
  const id = readText(productId);
  if (!id) throw new Error("Falta el producto.");

  const accepted = Array.isArray(urls)
    ? urls.map((url) => readText(url)).filter((url) => /^https?:\/\//.test(url))
    : [];

  if (accepted.length === 0) return 0;

  const product = await findProductAnywhere(id);
  if (!product) throw new Error("No se encontró el producto.");

  const { updateProduct } = await import("@/lib/store");
  const current = product.researchInputs?.competitorUrls ?? [];

  await updateProduct(id, {
    researchInputs: {
      niche: product.researchInputs?.niche ?? "",
      amazonUrl: product.researchInputs?.amazonUrl ?? "",
      targetAgeRange: product.researchInputs?.targetAgeRange ?? "",
      targetGenders: product.researchInputs?.targetGenders ?? [],
      competitorUrls: [...new Set([...current, ...accepted])],
    },
  });

  revalidatePath(`/products/${id}`);
  return accepted.length;
}

/* ------------------------------------ Ideas -------------------------------------- */

export interface GeneratedIdea {
  title: string;
  rationale: string;
  basedOn: string;
  awarenessLevel: AwarenessLevel;
  firstLine: string;
}

export async function generateIdeasAction(
  productId: unknown,
  target: unknown,
): Promise<LaunchResult> {
  const ctx = await context(productId);

  const wanted = readText(target, "angulos");
  const kind =
    wanted === "anuncios" || wanted === "publirreportajes"
      ? (wanted as "anuncios" | "publirreportajes")
      : ("angulos" as const);

  const [angles, copies, records, trees] = await Promise.all([
    readAngles(ctx.id),
    readCopies(ctx.id),
    readPerformance(ctx.id),
    readCampaignTrees(ctx.id),
  ]);

  const adsetAngles = new Map<string, string>(
    trees
      .flatMap((tree) => tree.adsets.map((node) => node.adset))
      .filter((adset) => Boolean(adset.angleId))
      .map((adset) => [adset.id, adset.angleId as string]),
  );

  const performance = rollUpByAngle({
    angles,
    copies,
    shortAds: trees.flatMap((tree) => tree.adsets.flatMap((node) => node.ads)),
    adsetAngles,
    records,
  });

  if (records.length === 0) {
    throw new Error(
      "Las ideas salen de lo que ya has marcado como ganador o perdedor. Valora antes algunos copys o anuncios.",
    );
  }

  const prompt = buildIdeasPrompt({
    product: ctx.product,
    research: ctx.research,
    store: ctx.store,
    marketContext: ctx.marketContext,
    angles,
    copies,
    shortAds: trees.flatMap((tree) => tree.adsets.flatMap((node) => node.ads)),
    records,
    anglePerformance: performance,
    target: kind,
    count: 5,
  });

  return runInBackground({
    productId: ctx.id,
    kind: "ideas",
    label: `Ideas · ${kind}`,
    work: async () => {
      const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = await generateStructured<{
        ideas: GeneratedIdea[];
      }>({ prompt, schema: IDEAS_SCHEMA, role: "research" });

      const base = await outcome(
        "research",
        "ideas",
        ctx,
        `${data.ideas.length} ideas nuevas.`,
        { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      );

      /*
       * Las ideas no se guardan en su propia tabla: son una propuesta para leer
       * y decidir, no una entidad de la plataforma. Viajan en `result` porque
       * el trabajo termina después de la respuesta y este es el único sitio
       * donde la interfaz puede recogerlas.
       */
      return { ...base, result: { ideas: data.ideas } };
    },
  });
}

/* --------------------------- Análisis de la ficha ------------------------------- */

/**
 * Completa la ficha del producto leyendo su web.
 *
 * **Los ingredientes son lo que de verdad se busca aquí.** El copy que cierra
 * bien explica qué hace cada uno y por qué esa forma concreta; con solo los
 * nombres —que era todo lo que guardaba la ficha, y ni siquiera llegaba a los
 * prompts— ese cierre no se puede escribir.
 *
 * No guarda nada solo: devuelve una propuesta que tú confirmas campo a campo.
 * Sobrescribir lo que escribiste a mano con lo que dedujo un modelo sería la
 * peor forma de «ayudar».
 */
export async function analyzeProductSheetAction(
  productId: unknown,
  /** Si se admiten campos deducidos cuando la web no los da. */
  allowInference: unknown,
): Promise<LaunchResult> {
  const ctx = await context(productId);
  const infer = allowInference === true;

  if (!ctx.product.landingUrl && !ctx.product.brand) {
    throw new Error(
      "Sin URL de la ficha ni marca no hay por dónde empezar a buscar. Añade al menos una en Editar producto.",
    );
  }

  const prompt = buildProductAnalysisPrompt(ctx.product, infer);

  return runInBackground({
    productId: ctx.id,
    kind: "ficha",
    label: `Analizar la ficha de ${ctx.product.name}`,
    work: async () => {
      const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = await generateStructured<{
        ingredients: {
          name: string;
          role: string;
          form: string;
          dose: string;
          source: "web" | "inferido";
        }[];
        description: string;
        targetAudience: string;
        benefits: string[];
        features: string[];
        problemsSolved: string[];
        objections: string[];
        notes: string[];
      }>({
        prompt,
        schema: PRODUCT_ANALYSIS_SCHEMA,
        role: "research",
        // La ficha está en la web, no en la memoria del modelo.
        webSearch: true,
      });

      const found = data.ingredients.filter((item) => item.source === "web").length;
      const inferred = data.ingredients.length - found;

      const base = await outcome(
        "research",
        "ficha",
        ctx,
        `${data.ingredients.length} ingredientes (${found} de la web${
          inferred > 0 ? `, ${inferred} deducidos` : ""
        }). Revísalos antes de guardar.`,
        { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      );

      // Va en `result` porque lo confirmas tú: nada se escribe en la ficha
      // hasta que decides qué entra.
      return { ...base, result: data };
    },
  });
}

/** Guarda los campos del análisis que hayas aceptado. */
export async function applyProductAnalysisAction(input: unknown): Promise<{ ok: boolean }> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = readText(raw.productId);
  if (!id) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }

  const patch = (raw.patch ?? {}) as Record<string, unknown>;
  const { updateProduct } = await import("@/lib/data/products");

  // Solo lo que venga: un campo ausente se deja como estaba, no se vacía.
  await updateProduct(id, patch as never);

  revalidatePath(`/products/${id}`);
  revalidatePath(`/products/${id}/edit`);
  return { ok: true };
}

/* ------------------------------- Adaptar un copy --------------------------------- */

/**
 * Adapta un copy ajeno a este producto y lo guarda como copy propio.
 *
 * **El resultado entra en la lista del producto, no en el archivo de
 * referencia.** Es la diferencia entre «esto me sirvió de inspiración» y «esto
 * es mío y de aquí salen anuncios y páginas»: una vez adaptado, se comporta como
 * cualquier copy generado.
 */
export async function adaptCopyAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ctx = await context(raw.productId);

  const method = findCopyMethod(readText(raw.methodId));
  if (!method) throw new Error("Elige un marco de escritura.");

  const awarenessLevel = (readText(raw.awarenessLevel) || "problem-aware") as AwarenessLevel;
  const fidelity = readText(raw.fidelity) === "inspirado" ? "inspirado" : "calcado";

  /*
   * El texto puede venir pegado a mano o de uno guardado.
   *
   * Las dos vías acaban igual, y por eso se resuelven aquí: quien llama no
   * tiene que saber de dónde salió.
   */
  let sourceText = readText(raw.sourceText);
  let sourceNote = readText(raw.sourceNote);

  const swipeId = readText(raw.swipeId);
  if (!sourceText && swipeId) {
    // Aquí se busca entre **todos** a propósito: adaptar un copy de otro
    // producto es justo lo que hace esta acción, y llega elegido por su id.
    const { listAllSwipeCopies } = await import("@/lib/data/swipe");
    const found = (await listAllSwipeCopies()).find((item) => item.id === swipeId);
    if (!found) throw new Error("Ese copy de referencia ya no existe.");

    sourceText = found.body;
    sourceNote = sourceNote || [found.title, found.source].filter(Boolean).join(" · ");
  }

  if (sourceText.length < 120) {
    throw new Error("Pega el copy completo: con un fragmento corto no hay estructura que adaptar.");
  }

  const prompt = buildAdaptPrompt({
    product: ctx.product,
    research: ctx.research,
    store: ctx.store,
    marketContext: ctx.marketContext,
    method,
    awarenessLevel,
    sourceText,
    sourceNote: sourceNote || undefined,
    fidelity,
  });

  return runInBackground({
    productId: ctx.id,
    kind: "copys",
    label: `Adaptar · ${sourceNote || method.name}`,
    work: async () => {
      /*
       * `generateLongCopy` cuenta las palabras en el servidor y, si la pieza
       * salió corta, pide una ampliación antes de guardarla. Antes se guardaba
       * el `wordCount` que el modelo declaraba de sí mismo, así que una
       * adaptación de cuatrocientas palabras podía decir mil doscientas.
       */
      const { data, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } =
    await generateLongCopy({
        prompt,
        schema: LONG_COPY_SCHEMA,
        range: method.wordRange,
      });

      const existing = await readCopies(ctx.id);

      const copy: GeneratedCopy = {
        id: "",
        productId: ctx.id,
        format: method.format,
        methodId: method.id,
        driver: "desire",
        driverLabel: sourceNote || "Adaptado",
        awarenessLevel,
        content: {
          primaryText: data.primaryText,
          headline: clampToLimit(data.headline, FACEBOOK_LIMITS.headline),
          description: clampToLimit(data.description, FACEBOOK_LIMITS.description),
        },
        wordCount: data.wordCount,
        status: "draft",
        createdAt: new Date().toISOString(),
      };

      await saveCopies(ctx.id, [...existing, copy]);

      return outcome(
        "copy",
        "copys",
        ctx,
        `${data.note}. Está en borrador, en la lista del producto.`,
        { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      );
    },
  });
}
