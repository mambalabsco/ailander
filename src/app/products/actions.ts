"use server";

import { revalidatePath } from "next/cache";
import { createProduct, type ProductDraftInput } from "@/lib/products";
import { deleteProduct, findProduct, saveProduct, updateProduct } from "@/lib/store";
import { importFromProductUrl } from "@/lib/shopify-import";
import { findStore, listStores, primaryMarket } from "@/lib/store-registry";
import { duplicateProductToMarket } from "@/lib/product-duplication";
import { addProductMarket } from "@/lib/data/product-markets";
import { findMarket, productUrlFor } from "@/types/store";
import type { Product, ProductStatus } from "@/types";

/**
 * Las Server Actions son endpoints HTTP públicos: nunca confiamos en la
 * forma del objeto que llega del cliente.
 */
function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => readText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeDraft(input: unknown): ProductDraftInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = readText(raw.name);

  if (!name) {
    throw new Error("El nombre del producto es obligatorio.");
  }

  return {
    name,
    brand: readText(raw.brand) || name,
    category: readText(raw.category, "General"),
    description: readText(raw.description),
    country: readText(raw.country, "España"),
    language: readText(raw.language, "Español"),
    targetAudience: readText(raw.targetAudience),
    price: readNumber(raw.price),
    landingUrl: readText(raw.landingUrl),
    tone: readText(raw.tone, "Claro"),
    research: {
      niche: readText(raw.niche, "General"),
      // Una URL por línea en el formulario.
      competitorUrls: readList(raw.competitorUrls),
      amazonUrl: readText(raw.amazonUrl),
      targetAgeRange: readText(raw.targetAgeRange),
      targetGenders: readList(raw.targetGenders),
    },
    storeId: readText(raw.storeId) || undefined,
    marketId: readText(raw.marketId) || undefined,
    handle: readText(raw.handle) || undefined,
    importedImageUrls: readList(raw.importedImageUrls).filter((url) =>
      /^https?:\/\//.test(url),
    ),
  };
}

/**
 * Crear un producto guarda la ficha y los datos que los prompts necesitarán.
 * No genera investigación ni consume tokens: eso es un paso aparte y explícito.
 */
export async function createProductFromForm(input: unknown) {
  const draft = normalizeDraft(input);

  // Todo producto cuelga de una tienda y un mercado: si el formulario no los
  // trae, se usan los principales en vez de dejarlo huérfano.
  if (!draft.storeId || !draft.marketId) {
    const stores = await listStores();
    const store = stores.find((item) => item.id === draft.storeId) ?? stores[0];
    if (store) {
      draft.storeId = store.id;
      draft.marketId = draft.marketId ?? primaryMarket(store)?.id;
    }
  }

  // La URL de la ficha se deriva del mercado siempre que haya handle: así el
  // mismo producto en otro país apunta solo a donde debe.
  if (draft.handle && draft.storeId && draft.marketId) {
    const store = await findStore(draft.storeId);
    const market = store ? findMarket(store, draft.marketId) : undefined;
    if (store && market) {
      draft.landingUrl = productUrlFor(store, market, draft.handle);
      draft.country = market.countryName;
      draft.language = market.languageName;
    }
  }

  const product = await createProduct(draft);

  /*
   * El mercado base tiene que estar entre los mercados del producto.
   *
   * Es la invariante de la que cuelga todo lo demás. Sin esto, los productos
   * creados a partir de ahora nacen sin ninguna fila en `product_markets`: el
   * selector no aparecería nunca y la pestaña de precios saldría vacía para
   * siempre. La migración metió a los que ya existían; esto es para los nuevos.
   */
  if (product.marketId) await addProductMarket(product.id, product.marketId);

  revalidatePath("/products");
  revalidatePath("/");

  return { product };
}

export async function updateProductFromForm(id: string, patch: unknown) {
  const productId = readText(id);
  if (!productId) {
    throw new Error("Falta el identificador del producto.");
  }

  const raw = (patch ?? {}) as Record<string, unknown>;
  const status = readText(raw.status);

  /*
   * Los datos de investigación solo se tocan si el formulario los trae.
   *
   * Antes no había forma de corregirlos desde la interfaz, así que hay fichas
   * con valores escritos a la fuerza. Se sobrescriben enteros cuando llegan y
   * se dejan intactos cuando no, para no vaciarlos desde otro formulario que
   * no los incluya.
   */
  const sendsResearch =
    raw.niche !== undefined ||
    raw.amazonUrl !== undefined ||
    raw.competitorUrls !== undefined ||
    raw.targetAgeRange !== undefined ||
    raw.targetGenders !== undefined;

  const research = sendsResearch
    ? {
        niche: readText(raw.niche),
        competitorUrls: readList(raw.competitorUrls),
        amazonUrl: readText(raw.amazonUrl),
        targetAgeRange: readText(raw.targetAgeRange),
        targetGenders: readList(raw.targetGenders),
      }
    : undefined;

  const updated = await updateProduct(productId, {
    name: readText(raw.name) || undefined,
    brand: readText(raw.brand) || undefined,
    category: readText(raw.category) || undefined,
    description: readText(raw.description),
    targetAudience: readText(raw.targetAudience),
    country: readText(raw.country) || undefined,
    language: readText(raw.language) || undefined,
    tone: readText(raw.tone) || undefined,
    landingUrl: readText(raw.landingUrl),
    price: readNumber(raw.price),
    benefits: readList(raw.benefits),
    features: readList(raw.features),
    problemsSolved: readList(raw.problemsSolved),
    objections: readList(raw.objections),
    status: status === "active" || status === "draft" ? (status as ProductStatus) : undefined,
    researchInputs: research,
    /*
     * La tienda y el mercado solo se tocan si el formulario los trae.
     *
     * Se propagan con `...` condicional y no con `undefined` porque el mapeador
     * distingue «no viene» de «vacío» con `in`: mandar la clave con `undefined`
     * la haría existir y borraría el vínculo, que es el fallo que había.
     */
    ...(raw.storeId === undefined ? {} : { storeId: readText(raw.storeId) || undefined }),
    ...(raw.marketId === undefined ? {} : { marketId: readText(raw.marketId) || undefined }),
    // Igual que los dos de arriba: solo se toca si el formulario lo trae, para
    // que una actualización parcial no apague el interruptor sin querer.
    ...(typeof raw.researchShared === "boolean" ? { researchShared: raw.researchShared } : {}),
  });

  if (!updated) {
    throw new Error("No se encontró el producto que intentas actualizar.");
  }

  // Cambiar el mercado base lo mete entre los mercados del producto si no
  // estaba. Sin esto, mover un producto a otro país lo dejaría con un precio
  // base que no pertenece a ningún mercado suyo.
  if (updated.marketId) await addProductMarket(updated.id, updated.marketId);

  revalidatePath("/products");
  revalidatePath("/competitors");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/");

  return updated;
}

export async function deleteProductAction(id: string) {
  const productId = readText(id);
  if (!productId) {
    throw new Error("Falta el identificador del producto.");
  }

  const removed = await deleteProduct(productId);

  revalidatePath("/products");
  revalidatePath("/competitors");
  revalidatePath("/");

  return removed;
}

export async function createCompetitorProduct(input: unknown) {
  const draft = normalizeDraft(input);

  const competitor: Product = {
    id: `comp-${Date.now().toString(36)}`,
    researchShared: false,
    name: draft.name,
    brand: draft.brand,
    category: draft.category,
    description: draft.description,
    benefits: [],
    features: [],
    ingredients: [],
    targetAudience: draft.targetAudience,
    problemsSolved: [],
    objections: [],
    country: draft.country,
    language: draft.language,
    price: draft.price,
    landingUrl: draft.landingUrl,
    images: [],
    tone: draft.tone,
    status: "active",
    createdAt: new Date().toISOString().slice(0, 10),
    owner: "competitor",
  };

  await saveProduct(competitor);

  revalidatePath("/competitors");
  revalidatePath("/");

  return competitor;
}

/* ------------------------- Importar desde la tienda ---------------------------- */

/**
 * Lee la ficha pública de un producto de Shopify a partir de su URL.
 *
 * No crea nada: devuelve los datos para rellenar el formulario, que el usuario
 * revisa antes de guardar. Tampoco consume tokens — es la propia tienda la que
 * sirve el JSON.
 */
export async function importProductFromUrlAction(rawUrl: unknown) {
  const url = readText(rawUrl);
  if (!url) {
    return { ok: false as const, reason: "Pega la URL de la ficha del producto." };
  }
  return importFromProductUrl(url);
}

/* ------------------------------ Duplicar producto ------------------------------ */

export async function duplicateProductAction(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;

  const sourceId = readText(raw.productId);
  const storeId = readText(raw.storeId);
  const marketId = readText(raw.marketId);

  if (!sourceId || !storeId || !marketId) {
    throw new Error("Faltan el producto de origen, la tienda o el mercado de destino.");
  }

  const [source, store] = await Promise.all([findProduct(sourceId), findStore(storeId)]);
  if (!source) throw new Error("No se encontró el producto de origen.");
  if (!store) throw new Error("No se encontró la tienda de destino.");

  const market = findMarket(store, marketId);
  if (!market) throw new Error("Ese mercado no existe en la tienda elegida.");

  if (source.storeId === storeId && source.marketId === marketId) {
    throw new Error("El producto ya está en ese mercado.");
  }

  const priceRaw = raw.price;
  const duplicate = await duplicateProductToMarket({
    source,
    store,
    market,
    name: readText(raw.name) || undefined,
    price: priceRaw === undefined || priceRaw === "" ? undefined : readNumber(priceRaw, source.price),
  });

  revalidatePath("/products");
  revalidatePath("/stores");
  revalidatePath("/");

  return duplicate;
}
