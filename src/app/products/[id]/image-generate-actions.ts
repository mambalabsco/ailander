"use server";

import { runInBackground } from "@/lib/background";
import { recordRun } from "@/lib/data/runs";
import type { LaunchResult } from "@/types/jobs";
import { findProductAnywhere } from "@/lib/products";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { generateImage } from "@/lib/higgsfield";
import { generateWithCli } from "@/lib/higgsfield-cli";
import { readCatalog, resolveReferenceSupport } from "@/lib/higgsfield-catalog";
import { readProductImages, readPrimaryImage } from "@/lib/image-store";
import {
  PRODUCT_IMAGE_PATTERNS,
  PRODUCT_IMAGE_PATTERN_META,
  buildImageName,
} from "@/types/visuals";
import type { ProductImageBrief, ProductImagePattern } from "@/types/visuals";
import { buildProductImagePrompt } from "@/lib/visual-prompts";
import { readProductResearch } from "@/lib/research-store";

/**
 * Generación de imágenes con Higgsfield, por sus dos vías.
 *
 * La API de clave y el CLI tienen catálogos distintos. Nano Banana Pro y las
 * imágenes de referencia solo están en el CLI, así que el modelo elegido decide
 * por dónde sale la petición. El resultado se trata igual en los dos casos: se
 * descarga y se sube a tu bucket privado, porque guardar solo el enlace del CDN
 * de Higgsfield haría que la galería dependiera de que ellos lo mantengan vivo.
 */

export interface ImageGenerationResult {
  ok: boolean;
  created: number;
  message: string;
  failures: { pattern: string; reason: string }[];
}

/**
 * El resumen que se guarda en el trabajo.
 *
 * Los fallos van dentro del texto y no en un campo aparte: al terminar en
 * segundo plano, todo lo que la persona verá es esa frase, y una imagen que
 * falló en silencio es una imagen que crees tener y no tienes.
 */
function summarise(created: number, failures: { pattern: string; reason: string }[]): string {
  const head =
    created > 0
      ? `${created} imagen(es) generadas y guardadas en tu bucket.`
      : "No se generó ninguna imagen.";

  if (failures.length === 0) return head;

  return `${head} Fallaron ${failures.length}: ${failures
    .map((failure) => `${failure.pattern} (${failure.reason})`)
    .join("; ")}`;
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

/** El catálogo de las dos vías, para elegir en la interfaz. */
export async function listHiggsfieldModelsAction() {
  const catalog = await readCatalog();

  if (catalog.models.length === 0) {
    throw new Error(
      catalog.warnings.join(" ") || "No hay ningún modelo de Higgsfield disponible.",
    );
  }

  return catalog;
}

/**
 * La foto del producto, lista para mandar como referencia.
 *
 * Se baja aquí porque vive en un bucket **privado**: la URL está firmada y
 * caduca, así que no se le puede pasar el enlace al CLI y esperar que la
 * descargue él. Van los bytes.
 *
 * Si no hay foto marcada como principal se devuelve vacío y la generación sigue
 * sin referencia: es peor no generar nada que generar sin la foto.
 */
async function readReferenceBytes(
  productId: string,
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const primary = await readPrimaryImage(productId);
  if (!primary?.url) return [];

  try {
    const response = await fetch(primary.url);
    if (!response.ok) return [];

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) return [];

    return [{ filename: `${primary.name}.png`, bytes }];
  } catch {
    return [];
  }
}

/** Una generación, por la vía que corresponda al modelo. */
async function runOne(options: {
  model: { slug: string; source: "api" | "cli" };
  prompt: string;
  aspectRatio: string;
  references: { filename: string; bytes: Uint8Array }[];
}): Promise<{ url: string } | { error: string }> {
  if (options.model.source === "cli") {
    const result = await generateWithCli({
      model: options.model.slug,
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      references: options.references,
    });

    return result.imageUrls[0]
      ? { url: result.imageUrls[0] }
      : { error: "El CLI no devolvió ninguna imagen." };
  }

  const result = await generateImage({
    modelSlug: options.model.slug,
    prompt: options.prompt,
    aspectRatio: options.aspectRatio,
  });

  if (result.status !== "completed" || result.imageUrls.length === 0) {
    return { error: result.error ?? "No devolvió ninguna imagen." };
  }

  return { url: result.imageUrls[0] };
}

/** El modelo elegido, comprobado contra el catálogo real. */
async function resolveModel(slug: string) {
  if (!slug) throw new Error("Elige un modelo de Higgsfield.");

  const catalog = await readCatalog();
  const model = catalog.models.find((item) => item.slug === slug);

  // Sin esto, un slug inventado se enviaría a la API por defecto y devolvería un
  // 404 confuso en vez de decir que ese modelo no está disponible.
  if (!model) {
    throw new Error(
      `El modelo «${slug}» no está disponible. ${catalog.warnings.join(" ")}`.trim(),
    );
  }

  // Se comprueba una vez por tanda, no por imagen: es una llamada a la API y el
  // modelo no cambia a mitad.
  return { ...model, acceptsReferences: await resolveReferenceSupport(model) };
}

export async function generateProductImagesAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("Las imágenes se guardan en Supabase y todavía no está configurado.");
  }

  const model = await resolveModel(readText(raw.modelSlug));

  const patterns = (Array.isArray(raw.patterns) ? raw.patterns : [])
    .map((item) => readText(item))
    .filter((item): item is ProductImagePattern =>
      (PRODUCT_IMAGE_PATTERNS as readonly string[]).includes(item),
    );

  if (patterns.length === 0) throw new Error("No has elegido ninguna imagen que generar.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  /*
   * Los prompts se montan aquí, no en el navegador.
   *
   * Llevan dentro la investigación —la promesa principal, el competidor de
   * referencia, el público— y eso no está en el cliente. Mandarlos desde allí
   * obligaría a enviar toda la investigación al navegador para nada.
   */
  const research = await readProductResearch(productId);

  const brief: ProductImageBrief = {
    referenceUrls: [],
    additionalInstructions: readText(raw.instructions),
    backgroundStyle: readText(raw.backgroundStyle),
    paletteNote: readText(raw.paletteNote),
    patterns,
  };

  const jobs = patterns.map((pattern) => ({
    pattern,
    aspectRatio: PRODUCT_IMAGE_PATTERN_META[pattern].aspectRatio,
    prompt: buildProductImagePrompt({ product, research, pattern, brief }),
  }));

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `${patterns.length} imagen(es) de ${product.name}`,
    work: async () => {
  // Una sola vez para toda la tanda: bajar la misma foto diez veces solo añade
  // espera. Y solo si el modelo la admite — mandarla a uno que no la declara
  // aborta la generación entera con «Unknown params».
  const references = model.acceptsReferences ? await readReferenceBytes(productId) : [];

  const existing = await readProductImages(productId);
  const { uploadGeneratedImage } = await import("@/lib/data/images");

  const failures: ImageGenerationResult["failures"] = [];
  let created = 0;
  let index = existing.length;

  /*
   * De una en una, no en paralelo.
   *
   * Higgsfield admite 4 peticiones simultáneas por cuenta y devuelve un 400 al
   * pasarse. Lanzar diez de golpe haría fallar seis y cobrar las cuatro que
   * entraron, que es la peor combinación posible.
   */
  for (const job of jobs) {
    const { pattern, prompt, aspectRatio } = job;

    try {
      const outcome = await runOne({ model, prompt, aspectRatio, references });

      if ("error" in outcome) {
        failures.push({ pattern, reason: outcome.error });
        continue;
      }

      index += 1;
      const name = buildImageName({ productName: product.name, pattern, index });

      await uploadGeneratedImage({
        productId,
        sourceUrl: outcome.url,
        name,
        pattern,
        prompt,
        modelId: model.slug,
      });

      created += 1;
    } catch (error) {
      failures.push({
        pattern,
        reason: error instanceof Error ? error.message : "Error desconocido.",
      });

      // Ni el tope de peticiones simultáneas ni la falta de sesión se arreglan
      // insistiendo: si aparecen, se para la tanda en vez de quemar intentos
      // contra la misma pared.
      if (error instanceof Error && /4 generaciones|no tiene sesión/.test(error.message)) break;
    }
  }

      // El sufijo del mensaje, no la decisión de enviarla.
      const referenceNote =
        references.length > 0 ? " Con la foto del producto como referencia." : "";

      await recordRun({
        productId,
        productName: product.name,
        kind: "imagen",
        detail: `${created} imagen(es) · ${model.slug}`,
        model: model.slug,
        status: failures.length === 0 ? "ok" : "error",
        error: failures.length > 0 ? summarise(created, failures) : null,
        // Higgsfield cobra en créditos, no en tokens: el coste en dólares no lo
        // sabemos aquí y poner una cifra inventada sería peor que no ponerla.
        inputTokens: 0,
        outputTokens: 0,
      });

      return { summary: `${summarise(created, failures)}${referenceNote}` };
    },
  });
}

/**
 * Genera las creatividades de un anuncio.
 *
 * A diferencia de las imágenes de producto, aquí los prompts vienen ya hechos
 * —los calculó el servidor al pintar la pestaña— y solo hay que enviarlos.
 *
 * La foto del producto va como referencia cuando el modelo la admite, que es lo
 * que evita que el modelo se invente el envase. Solo por la vía del CLI: la API
 * de clave acepta campos que no reconoce, encola la generación y cobra igual,
 * así que allí una referencia adivinada daría imágenes que parecen bien y no
 * usan tu producto.
 */
export async function generateAdVisualsAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Falta el producto.");

  if (!isSupabaseConfigured()) {
    throw new Error("Las imágenes se guardan en Supabase y todavía no está configurado.");
  }

  const model = await resolveModel(readText(raw.modelSlug));

  // De qué copy salen. Sin esto la imagen cae en la galería sin poder enseñarse
  // dentro del anuncio que la usa.
  const copyId = readText(raw.copyId);
  const adId = readText(raw.adId);
  const landingId = readText(raw.landingId);

  // Por defecto sí: casi todas las creatividades enseñan el producto. Los
  // retratos de los comentarios son la excepción y lo piden explícitamente.
  const withReference = raw.withReference !== false;

  const visuals = (Array.isArray(raw.visuals) ? raw.visuals : [])
    .map((item) => {
      const visual = (item ?? {}) as Record<string, unknown>;
      return {
        title: readText(visual.title, "creatividad"),
        prompt: readText(visual.prompt),
        aspectRatio: readText(visual.aspectRatio, "1:1"),
        concept: readText(visual.concept),
        // Por creatividad, no por tanda: al generar toda la campaña de golpe
        // cada imagen pertenece a un anuncio distinto.
        adId: readText(visual.adId),
        landingId: readText(visual.landingId),
        // El gancho o el ángulo del que nace: es lo que hace reconocible el
        // archivo cuando lo descargas junto a otros diecinueve.
        origin: readText(visual.origin),
        /*
         * Si **esta** creatividad lleva el producto.
         *
         * Antes era una decisión de toda la tanda, y con las escenas sacadas de
         * la historia eso no sirve: de siete escenas, seis no enseñan el frasco
         * —el desagüe de la ducha, el análisis, el techo a las tres— y mandarles
         * la foto de referencia les pega un bote de suplemento dentro. Cuando no
         * viene, se usa la decisión de la tanda, que es como se comportaba.
         */
        withReference:
          typeof visual.withReference === "boolean" ? visual.withReference : undefined,
      };
    })
    .filter((visual) => visual.prompt);

  if (visuals.length === 0) throw new Error("No hay ninguna creatividad que enviar.");

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `${visuals.length} creatividad(es) de ${product.name}`,
    work: async () => {
  /*
   * La foto del producto **no siempre debe ir**.
   *
   * Se mandaba siempre que el modelo la admitiera, y eso rompió los retratos de
   * los comentarios: Soul acepta referencias, recibía el frasco y devolvía ocho
   * fotos del producto en lugar de ocho caras. Una referencia solo ayuda cuando
   * lo que se genera **es** el producto.
   */
  /*
   * La foto se baja una sola vez, y se decide por creatividad a quién se le pasa.
   *
   * Bajarla dentro del bucle repetiría la descarga en cada imagen; decidir por
   * tanda pegaría el producto en escenas que no lo llevan.
   */
  const anyNeedsReference = visuals.some((visual) => visual.withReference ?? withReference);

  const references =
    anyNeedsReference && model.acceptsReferences ? await readReferenceBytes(productId) : [];

  const existing = await readProductImages(productId);
  const { uploadGeneratedImage } = await import("@/lib/data/images");

  const failures: ImageGenerationResult["failures"] = [];
  let created = 0;
  let index = existing.length;

  for (const visual of visuals) {
    try {
      const outcome = await runOne({
        model,
        prompt: visual.prompt,
        aspectRatio: visual.aspectRatio,
        // Solo las que enseñan el producto reciben su foto.
        references: (visual.withReference ?? withReference) ? references : [],
      });

      if ("error" in outcome) {
        failures.push({ pattern: visual.title, reason: outcome.error });
        continue;
      }

      index += 1;

      await uploadGeneratedImage({
        productId,
        sourceUrl: outcome.url,
        /*
         * El nombre lleva el concepto y el gancho.
         *
         * El comentario anterior decía que lo llevaba y el código pasaba
         * «subida»: salía `naturox_subida_07`, que no identifica nada cuando
         * tienes veinte descargadas en una carpeta.
         */
        name: buildImageName({
          productName: product.name,
          pattern: "subida",
          index,
          concept: visual.concept || visual.title,
          origin: visual.origin,
        }),
        pattern: "subida",
        prompt: visual.prompt,
        modelId: model.slug,
        copyId: copyId || undefined,
        adId: visual.adId || adId || undefined,
        landingId: visual.landingId || landingId || undefined,
        concept: visual.concept || undefined,
        originLabel: visual.origin || undefined,
      });

      created += 1;
    } catch (error) {
      failures.push({
        pattern: visual.title,
        reason: error instanceof Error ? error.message : "Error desconocido.",
      });
      if (error instanceof Error && /4 generaciones|no tiene sesión/.test(error.message)) break;
    }
  }

      // El sufijo del mensaje, no la decisión de enviarla.
      const referenceNote =
        references.length > 0 ? " Con la foto del producto como referencia." : "";

      await recordRun({
        productId,
        productName: product.name,
        kind: "imagen",
        detail: `${created} creatividad(es) · ${model.slug}`,
        model: model.slug,
        status: failures.length === 0 ? "ok" : "error",
        error: failures.length > 0 ? summarise(created, failures) : null,
        inputTokens: 0,
        outputTokens: 0,
      });

      return { summary: `${summarise(created, failures)}${referenceNote}` };
    },
  });
}
