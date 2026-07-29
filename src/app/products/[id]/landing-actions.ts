"use server";

import { revalidatePath } from "next/cache";
import { findProductAnywhere } from "@/lib/products";
import { findStore } from "@/lib/store-registry";
import { readProductResearch } from "@/lib/research-store";
import { readAngles, readCopies } from "@/lib/copy-store";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { generateStructured } from "@/lib/generators";
import { LANDING_PAGE_SCHEMA } from "@/lib/generation-schemas";
import { buildLandingPrompt } from "@/lib/landing-prompt";
import { AVATAR_POOL_SIZE, avatarSlot, buildAvatarPrompt } from "@/lib/avatar-prompts";
import { saveLanding, deleteLanding } from "@/lib/data/landings";
import { runInBackground } from "@/lib/background";
import { recordRun } from "@/lib/data/runs";
import { estimateCost, copyModel } from "@/lib/claude";
import { findCopyMethod } from "@/types/copy";
import type { LandingComment, LandingImageSlot, LandingSection } from "@/types/landing";
import type { LaunchResult } from "@/types/jobs";

/**
 * Generar un publirreportaje como página web completa.
 *
 * Se guarda por secciones y no como HTML: así, mejorar la plantilla mejora
 * también las páginas ya generadas, y el HTML se deriva al leer.
 */

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function generateLandingAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const method = findCopyMethod(readText(raw.methodId));
  if (!method) throw new Error("Ese marco de escritura no existe.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const [research, angles, copies] = await Promise.all([
    readProductResearch(productId),
    readAngles(productId),
    readCopies(productId),
  ]);

  const store = product.storeId ? await findStore(product.storeId) : null;

  const angleId = readText(raw.angleId);
  const angle = angles.find((item) => item.id === angleId) ?? null;

  // Cuando se parte de un copy ya escrito, se adapta en vez de empezar de cero.
  const copyId = readText(raw.copyId);
  const baseCopy = copies.find((item) => item.id === copyId)?.content.primaryText;

  const commentStyle = readText(raw.commentStyle) === "testimonios" ? "testimonios" : "facebook";

  /*
   * La referencia puede ser cualquier cosa guardada en el archivo: un copy que
   * funcionó, o una landing entera pegada de otra marca. Se trata igual.
   */
  const referenceId = readText(raw.referenceId);
  let reference: { label: string; body: string } | undefined;

  if (referenceId) {
    const { listSwipeCopies } = await import("@/lib/data/swipe");
    const found = (await listSwipeCopies()).find((item) => item.id === referenceId);
    if (!found) throw new Error("Esa referencia ya no existe.");

    reference = {
      label: [found.title, found.source].filter(Boolean).join(" · "),
      body: found.body,
    };
  }

  const fidelity = readText(raw.fidelity) === "inspirado" ? "inspirado" : "calcado";

  const prompt = buildLandingPrompt({
    product,
    research,
    store,
    method,
    baseCopy,
    angle,
    commentStyle,
    reference,
    fidelity,
    countryName: product.country || "México",
  });

  return runInBackground({
    productId,
    kind: "landing",
    label: `Página · ${method.name}`,
    work: async () => {
      const { data, inputTokens, outputTokens } = await generateStructured<{
        title: string;
        slug: string;
        header?: { enabled: boolean; announcement: string; logoText: string; kicker: string };
        author?: { name: string; credentials: string; updatedAt: string };
        sections: LandingSection[];
        imageSlots: LandingImageSlot[];
        comments: LandingComment[];
      }>({ prompt, schema: LANDING_PAGE_SCHEMA, role: "copy", maxTokens: 48_000 });

      const slots = data.imageSlots ?? [];

      /*
       * El logo y el retrato se enlazan solo si el modelo los propuso.
       *
       * Si no están, la cabecera cae al logo tipográfico y la ficha del autor a
       * su inicial: la página se ve entera desde el primer momento, sin esperar
       * a generar ninguna imagen.
       */
      const has = (slot: string) => slots.some((item) => item.slot === slot);

      const page = await saveLanding({
        productId,
        copyId: copyId || undefined,
        title: data.title,
        slug: data.slug,
        methodId: method.id,
        header: data.header
          ? {
              enabled: data.header.enabled !== false,
              announcement: data.header.announcement || undefined,
              logoText: data.header.logoText || product.brand || product.name,
              logoSlot: has("logo") ? "logo" : undefined,
              kicker: data.header.kicker || undefined,
            }
          : undefined,
        author: data.author?.name
          ? {
              name: data.author.name,
              credentials: data.author.credentials || "",
              photoSlot: has("autor") ? "autor" : undefined,
              updatedAt: data.author.updatedAt || undefined,
            }
          : undefined,
        sections: data.sections ?? [],
        imageSlots: slots,
        comments: data.comments ?? [],
      });

      const model = await copyModel();
      await recordRun({
        productId,
        productName: product.name,
        kind: "copy",
        detail: `Página: ${page.title}`,
        model,
        inputTokens,
        outputTokens,
      });

      return {
        summary: `«${page.title}» — ${page.sections.length} secciones, ${page.imageSlots.length} imágenes y ${page.comments.length} comentarios.`,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(model, inputTokens, outputTokens),
      };
    },
  });
}

export async function deleteLandingAction(id: unknown, productId: unknown): Promise<void> {
  const landingId = readText(id);
  const product = readText(productId);
  if (!landingId) return;

  await deleteLanding(landingId);
  if (product) revalidatePath(`/products/${product}`);
}

/* ------------------------- Retratos para los comentarios ------------------------- */

/**
 * Genera el grupo de retratos que usarán los comentarios.
 *
 * **Uno por producto, no uno por página.** Ocho caras bastan para que no se
 * repitan seguidas, y sirven en todas las landings: generar doce por página
 * sería pagar muchas veces por lo mismo.
 *
 * **Personas sintéticas.** No se parte de fotos de perfiles reales: la cara de
 * alguien identificable junto a un comentario escrito para la página implica un
 * aval que esa persona nunca dio.
 */
export async function generateCommentAvatarsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const modelSlug = readText(raw.modelSlug) || "text2image_soul_v2";

  // Solo los que faltan: repetir los que ya están es gastar dos veces.
  const existing = (await import("@/lib/image-store").then((m) => m.readProductImages(productId)))
    .map((image) => image.concept)
    .filter(Boolean);

  const pending = Array.from({ length: AVATAR_POOL_SIZE }, (_, index) => index).filter(
    (index) => !existing.includes(avatarSlot(index)),
  );

  if (pending.length === 0) {
    return { started: false, message: "Ya están los ocho retratos generados." };
  }

  const { generateAdVisualsAction } = await import("@/app/products/[id]/image-generate-actions");

  return generateAdVisualsAction({
    productId,
    modelSlug,
    // Sin la foto del producto: aquí se generan caras, no envases.
    withReference: false,
    visuals: pending.map((index) => ({
      title: `Retrato ${index + 1}`,
      prompt: buildAvatarPrompt({
        index,
        countryName: product.country || "México",
        audience: product.targetAudience,
      }),
      aspectRatio: "1:1",
      concept: avatarSlot(index),
      origin: "retrato de comentario",
    })),
  });
}

/* ------------------------------ Publicar en Shopify ------------------------------ */

/**
 * Sube las imágenes y publica la página en la tienda.
 *
 * El orden importa: **primero las imágenes, después la página**. El HTML lleva
 * las URLs del CDN de Shopify incrustadas, así que publicarlo antes de tenerlas
 * dejaría una página con los huecos vacíos y habría que repasarla a mano.
 *
 * Las imágenes ya subidas no se vuelven a subir: se guarda su URL de Shopify la
 * primera vez. Republicar es entonces barato y **actualiza la misma página**, en
 * vez de dejar otra con un enlace nuevo que los anuncios ya no apuntan.
 */
export async function publishLandingAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const landingId = readText(raw.id);
  const productId = readText(raw.productId);
  if (!landingId || !productId) throw new Error("Falta la página.");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }

  const { readLanding } = await import("@/lib/data/landings");
  const page = await readLanding(landingId);
  if (!page) throw new Error("Esa página ya no existe.");

  return runInBackground({
    productId,
    kind: "shopify",
    label: `Publicar «${page.title}»`,
    work: async () => {
      const { readProductImages } = await import("@/lib/image-store");
      const { uploadImages, createPage, updatePage } = await import("@/lib/shopify");
      const { renderLandingHtml } = await import("@/lib/landing-html");
      const { setShopifyUrl, markLandingPublished } = await import("@/lib/data/landings");
      const { AVATAR_POOL_SIZE, avatarSlot } = await import("@/lib/avatar-prompts");

      /*
       * La tienda del producto: cada una tiene su propia app y su propio token.
       * Sin tienda no hay dónde publicar, y decirlo aquí evita subir las
       * imágenes para descubrirlo después.
       */
      const product = await findProductAnywhere(productId);
      if (!product?.storeId) {
        throw new Error(
          "Este producto no está asignado a ninguna tienda. Asígnale una en Editar producto para poder publicar.",
        );
      }

      const store = await findStore(product.storeId);
      if (!store) throw new Error("No se encontró la tienda del producto.");

      const images = await readProductImages(productId);

      // Las de esta página, más los retratos, que son del producto.
      const relevant = images.filter(
        (image) =>
          image.landingId === page.id ||
          (image.concept &&
            Array.from({ length: AVATAR_POOL_SIZE }, (_, index) => avatarSlot(index)).includes(
              image.concept,
            )),
      );

      const toUpload = relevant.filter((image) => !image.shopifyUrl);

      let uploaded = 0;
      if (toUpload.length > 0) {
        const result = await uploadImages(
          store,
          toUpload.map((image) => ({
            url: image.url,
            alt:
              page.imageSlots.find((slot) => slot.slot === image.concept)?.alt || image.name,
          })),
        );

        for (const image of toUpload) {
          const file = result.get(image.url);
          if (!file) continue;

          await setShopifyUrl(image.id, file.url);
          image.shopifyUrl = file.url;
          uploaded += 1;
        }
      }

      /*
       * Solo entran las que ya tienen URL de Shopify.
       *
       * Una que haya fallado al subir se queda como hueco marcado en la página:
       * es visible y se arregla, mientras que meter la URL firmada de Supabase
       * daría una imagen que se rompe en una hora sin avisar.
       */
      const urls: Record<string, string> = {};
      const avatars: string[] = [];

      for (const image of relevant) {
        if (!image.shopifyUrl || !image.concept) continue;
        if (image.concept.startsWith("avatar-")) continue;
        urls[image.concept] = image.shopifyUrl;
      }

      for (let index = 0; index < AVATAR_POOL_SIZE; index += 1) {
        const found = relevant.find((image) => image.concept === avatarSlot(index));
        if (found?.shopifyUrl) avatars.push(found.shopifyUrl);
      }

      const html = renderLandingHtml(page, { urls, avatars, embedUrls: true });

      const published = page.shopifyPageId
        ? await updatePage(store, page.shopifyPageId, {
            title: page.title,
            body: html,
            published: true,
          })
        : await createPage(store, {
            title: page.title,
            handle: page.slug,
            body: html,
            published: true,
          });

      await markLandingPublished(page.id, published.id, published.url);

      const missing = relevant.length - relevant.filter((image) => image.shopifyUrl).length;

      return {
        summary: `Publicada en ${published.url}. ${uploaded} imagen(es) subidas${
          missing > 0 ? `, ${missing} sin subir y marcadas como hueco` : ""
        }.`,
      };
    },
  });
}

/* ------------------------------ Ajustes y pruebas -------------------------------- */

export async function saveLandingSettingsAction(input: unknown): Promise<void> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = readText(raw.id);
  const productId = readText(raw.productId);
  if (!id) throw new Error("Falta la página.");

  const { updateLandingSettings } = await import("@/lib/data/landings");

  await updateLandingSettings(id, {
    hideThemeChrome: raw.hideThemeChrome === true,
    utmCampaign: readText(raw.utmCampaign),
  });

  if (productId) revalidatePath(`/products/${productId}`);
}

export interface AbReport {
  landings: { key: string; orders: number; revenue: number; currency: string }[];
  verdict: { decided: boolean; winner?: string; message: string };
  byAd: Record<string, { key: string; orders: number; revenue: number; currency: string }[]>;
  totalOrders: number;
  days: number;
}

/**
 * Los resultados de cada landing, leídos de Shopify.
 *
 * Se lee en vivo y no se guarda copia: los pedidos cambian de estado
 * —reembolsos, cancelaciones— y una copia envejecería sin avisar, que en una
 * decisión de apagar una campaña es peor que no tener el dato.
 */
export async function readAbReportAction(input: unknown): Promise<AbReport> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  const days = Math.min(60, Math.max(1, Number(raw.days) || 30));

  const product = await findProductAnywhere(productId);
  if (!product?.storeId) throw new Error("El producto no está asignado a ninguna tienda.");

  const store = await findStore(product.storeId);
  if (!store) throw new Error("No se encontró la tienda.");

  const { readAttributedOrders } = await import("@/lib/shopify");
  const { byLanding, byAd, judge } = await import("@/lib/ab-stats");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const orders = await readAttributedOrders(store, { since });

  // Solo las páginas: los pedidos que entraron por la ficha de producto o por la
  // portada no dicen nada sobre qué publirreportaje funciona.
  const fromPages = orders.filter((order) => order.landingPath?.startsWith("/pages/"));

  const landings = byLanding(fromPages);
  const perAd: AbReport["byAd"] = {};
  for (const landing of landings) {
    perAd[landing.key] = byAd(fromPages, landing.key);
  }

  return {
    landings,
    verdict: judge(landings),
    byAd: perAd,
    totalOrders: orders.length,
    days,
  };
}

/* ----------------------------- Reparto de tráfico -------------------------------- */

export interface ExperimentReport {
  experiment: import("@/types/experiment").LandingExperiment;
  funnels: import("@/types/experiment").VariantFunnel[];
}

export async function listExperimentsAction(productId: unknown) {
  const id = readText(productId);
  if (!id || !isSupabaseConfigured()) return [];

  const { listExperiments } = await import("@/lib/data/experiments");
  return listExperiments(id).catch(() => []);
}

export async function saveExperimentAction(input: unknown): Promise<void> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const name = readText(raw.name);
  const slug = readText(raw.slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!productId) throw new Error("Falta el producto.");
  if (!name) throw new Error("Ponle un nombre a la prueba.");
  if (!slug) throw new Error("La prueba necesita un identificador para su URL.");

  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .map((item) => {
      const variant = (item ?? {}) as Record<string, unknown>;
      return {
        landingId: readText(variant.landingId),
        weight: Math.max(0, Math.round(Number(variant.weight) || 0)),
      };
    })
    .filter((variant) => variant.landingId);

  if (variants.length < 2) {
    throw new Error("Una prueba necesita al menos dos páginas entre las que repartir.");
  }
  if (variants.every((variant) => variant.weight === 0)) {
    throw new Error("Al menos una página tiene que llevarse tráfico.");
  }

  const { saveExperiment } = await import("@/lib/data/experiments");
  await saveExperiment({ productId, name, slug, variants, id: readText(raw.id) || undefined });

  revalidatePath(`/products/${productId}`);
}

export async function deleteExperimentAction(id: unknown, productId: unknown): Promise<void> {
  const { deleteExperiment } = await import("@/lib/data/experiments");
  await deleteExperiment(readText(id));

  const product = readText(productId);
  if (product) revalidatePath(`/products/${product}`);
}

/** El embudo de cada variante de una prueba. */
export async function readExperimentFunnelsAction(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;

  const experimentId = readText(raw.experimentId);
  if (!experimentId) throw new Error("Falta la prueba.");

  const days = Math.min(90, Math.max(1, Number(raw.days) || 14));

  const { readFunnels } = await import("@/lib/data/experiments");
  const funnels = await readFunnels(experimentId, days);

  return Object.fromEntries(funnels);
}
