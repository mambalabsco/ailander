import type { Product } from "@/types";
import type { Store, StoreMarket } from "@/types/store";
import { productUrlFor } from "@/types/store";
import { buildProductId } from "@/lib/products";
import { saveProduct } from "@/lib/store";
import { addProductMarket } from "@/lib/data/product-markets";
import { readAngles, saveAngles } from "@/lib/copy-store";
import { readProductImages, addProductImage } from "@/lib/image-store";
import { readProductResearch, saveProductResearch } from "@/lib/research-store";
import { emptyDocumentState } from "@/types/research";
import type { ProductResearch } from "@/types/research";
import { PRODUCT_IMAGE_PATTERN_META } from "@/types/visuals";

/** Extrae el handle de una URL de ficha, si la URL tiene forma de ficha. */
function handleFromUrl(url: string): string {
  if (!url) return "";
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\/products\/([^/]+)/);
    if (match) return match[1];
    // Algunas tiendas sirven la ficha en la raíz: /revital-serum
    const segments = path.split("/").filter(Boolean);
    return segments.length === 1 ? segments[0] : "";
  } catch {
    return "";
  }
}

/**
 * Duplica un producto a otro mercado.
 *
 * La regla que gobierna esto: **se arrastra lo que no depende del país ni del
 * idioma, y se deja vacío lo que sí.** Copiar la investigación entera produciría
 * un documento con datos de mercado de un país presentados como si fueran de
 * otro — plausible y falso, que es la peor combinación.
 *
 * En concreto:
 * - Los documentos 5 y 6 (deseo masivo) se heredan: el mecanismo del producto no
 *   cambia al cruzar una frontera.
 * - Los documentos 1 a 4 se vacían y quedan marcados como pendientes.
 * - Los ángulos se copian conservando su UMP y su UMS, pero se marcan para
 *   adaptar: la historia y las referencias culturales sí cambian.
 * - Las imágenes sin texto se heredan; las que llevan texto no, porque estaría
 *   en el idioma equivocado.
 * - El rendimiento no se copia: lo que funcionó allí es una hipótesis aquí.
 */
export async function duplicateProductToMarket(options: {
  source: Product;
  store: Store;
  market: StoreMarket;
  /** Nombre en el nuevo mercado. Por defecto, el mismo. */
  name?: string;
  /** Precio en la moneda del mercado. Si no se indica, se copia el original. */
  price?: number;
}): Promise<Product> {
  const { source, store, market } = options;

  const name = options.name?.trim() || source.name;

  /*
   * El handle es lo que permite reconstruir la URL en el nuevo mercado. Los
   * productos creados antes de la importación no lo tienen, así que se intenta
   * deducir de su propia URL. Si no hay forma de obtenerlo, la ficha se queda
   * **sin** URL: heredar la del país de origen mandaría el tráfico mexicano a
   * la página española, que es peor que dejar el campo pendiente.
   */
  const handle = source.handle || handleFromUrl(source.landingUrl);

  const duplicate: Product = {
    ...source,
    // El id incorpora el mercado para que dos duplicados no colisionen.
    id: buildProductId(`${name} ${market.countryCode} ${market.languageCode}`),
    name,
    price: options.price ?? source.price,
    country: market.countryName,
    language: market.languageName,
    handle: handle || undefined,
    landingUrl: handle ? productUrlFor(store, market, handle) : "",
    storeId: store.id,
    marketId: market.id,
    status: "draft",
    createdAt: new Date().toISOString().slice(0, 10),
    duplicatedFromId: source.id,
    researchInputs: source.researchInputs
      ? {
          ...source.researchInputs,
          // Los competidores son propios de cada país: no se arrastran.
          competitorUrls: [],
        }
      : undefined,
  };

  await saveProduct(duplicate);

  // El duplicado también nace en su mercado: si no, quedaría con precio base y
  // sin ningún mercado al que ese precio pertenezca.
  await addProductMarket(duplicate.id, market.id);

  /* Investigación: se hereda el deseo, se vacía lo dependiente del país. */
  const sourceResearch = await readProductResearch(source.id);

  const inherited: ProductResearch = {
    awareness: null,
    competitors: null,
    avatars: null,
    master: null,
    desireExtraction: sourceResearch.desireExtraction,
    desireValidation: sourceResearch.desireValidation,
    /*
     * Los de casino viajan enteros, como los del deseo: son del **país**, y
     * duplicar un producto de casino es duplicar el mismo país. Rehacerlos sería
     * pagar dos veces por el mismo informe.
     */
    regulation: sourceResearch.regulation,
    payments: sourceResearch.payments,
    casinoLandscape: sourceResearch.casinoLandscape,
    documents: {
      awareness: emptyDocumentState(),
      competitors: emptyDocumentState(),
      avatars: emptyDocumentState(),
      master: emptyDocumentState(),
      "desire-extraction": sourceResearch.documents["desire-extraction"],
      "desire-validation": sourceResearch.documents["desire-validation"],
      regulation: sourceResearch.documents.regulation,
      payments: sourceResearch.documents.payments,
      "casino-landscape": sourceResearch.documents["casino-landscape"],
    },
  };

  await saveProductResearch(duplicate.id, inherited);

  /* Ángulos: conservan mecanismo, cambian de producto. */
  const sourceAngles = await readAngles(source.id);
  if (sourceAngles.length > 0) {
    await saveAngles(
      duplicate.id,
      sourceAngles.map((angle) => ({
        ...angle,
        id: `${angle.id}-${market.id}`,
        productId: duplicate.id,
        createdAt: new Date().toISOString(),
      })),
    );
  }

  /* Imágenes: solo las que no llevan texto incrustado. */
  const sourceImages = await readProductImages(source.id);
  for (const image of sourceImages) {
    // Un patrón desconocido —de una versión anterior— se trata como si llevara
    // texto: no copiarlo es recuperable, copiarlo en el idioma equivocado no.
    const hasText =
      image.pattern !== "subida" &&
      (PRODUCT_IMAGE_PATTERN_META[image.pattern]?.hasText ?? true);
    if (hasText) continue;

    await addProductImage({
      ...image,
      id: `${image.id}-${market.id}`,
      productId: duplicate.id,
      createdAt: new Date().toISOString(),
    });
  }

  return duplicate;
}
