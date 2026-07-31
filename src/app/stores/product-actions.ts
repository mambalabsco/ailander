"use server";

import { revalidatePath } from "next/cache";
import { findStore } from "@/lib/store-registry";
import {
  deleteShopProduct,
  listShopProducts,
  listThemeFiles,
  listThemes,
  saveShopProduct,
  writeThemeFiles,
  type ListedProduct,
  type ShopTheme,
} from "@/lib/shopify-store";

/**
 * Gestión de la tienda desde la plataforma.
 *
 * Todo pasa por la tienda: cada una tiene su app y su token, así que quien
 * llama manda siempre el identificador de la tienda y aquí se resuelve. Un
 * token global publicaría en la equivocada.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function storeOf(id: string) {
  const store = await findStore(id);
  if (!store) throw new Error("No se encontró la tienda.");
  if (!store.shopifyAdminToken || !store.shopifyShopDomain) {
    throw new Error(
      `«${store.name}» no está conectada a Shopify. Conéctala arriba antes de gestionar productos.`,
    );
  }
  return store;
}

export async function listShopProductsAction(
  storeId: unknown,
  search: unknown,
): Promise<{ ok: boolean; products?: ListedProduct[]; message?: string }> {
  try {
    const store = await storeOf(readText(storeId));
    return { ok: true, products: await listShopProducts(store, { search: readText(search) }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar.";

    /*
     * El permiso de productos es nuevo y los tokens viejos no lo llevan.
     *
     * Shopify responde con un error de acceso que no dice que el problema sea
     * ese, y sin esta traducción alguien buscaría el fallo en la app o en la
     * tienda en vez de simplemente reconectar.
     */
    if (/access denied|permission|scope/i.test(message)) {
      return {
        ok: false,
        message:
          "Esta tienda se conectó antes de que la plataforma pidiera permiso sobre productos. Vuelve a conectarla arriba: el token guardado lleva grabados los permisos con los que se concedió.",
      };
    }

    return { ok: false, message };
  }
}

export async function saveShopProductAction(
  storeId: unknown,
  input: unknown,
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const title = readText(raw.title);
  if (!title) return { ok: false, message: "El producto necesita un título." };

  try {
    const store = await storeOf(readText(storeId));

    const saved = await saveShopProduct(store, {
      id: readText(raw.id) || undefined,
      title,
      descriptionHtml: readText(raw.descriptionHtml),
      vendor: readText(raw.vendor) || undefined,
      productType: readText(raw.productType) || undefined,
      handle: readText(raw.handle) || undefined,
      status: readText(raw.status) === "ACTIVE" ? "ACTIVE" : "DRAFT",
      tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => readText(tag)).filter(Boolean) : undefined,
      /*
       * Las variantes se mandan **completas** o no se mandan.
       *
       * `productSet` reemplaza la lista entera: mandar dos cuando el producto
       * tiene cinco borra las otras tres. Si quien llama no las trae, se omite
       * el campo y Shopify las deja como están.
       */
      variants: Array.isArray(raw.variants)
        ? raw.variants.map((item) => {
            const variant = (item ?? {}) as Record<string, unknown>;
            return {
              id: readText(variant.id) || undefined,
              price: Number(variant.price) || 0,
              compareAtPrice: Number(variant.compareAtPrice) || undefined,
              sku: readText(variant.sku) || undefined,
            };
          })
        : undefined,
      images: Array.isArray(raw.images)
        ? raw.images.map((item) => {
            const image = (item ?? {}) as Record<string, unknown>;
            return { url: readText(image.url), alt: readText(image.alt) };
          })
        : undefined,
    });

    revalidatePath("/stores");
    return { ok: true, url: saved.url };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

export async function deleteShopProductAction(
  storeId: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await deleteShopProduct(await storeOf(readText(storeId)), readText(productId));
    revalidatePath("/stores");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo borrar." };
  }
}

/* ---------------------------------- Tema ----------------------------------- */

export async function listThemesAction(
  storeId: unknown,
): Promise<{ ok: boolean; themes?: ShopTheme[]; message?: string }> {
  try {
    return { ok: true, themes: await listThemes(await storeOf(readText(storeId))) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo consultar." };
  }
}

export async function readThemeFilesAction(
  storeId: unknown,
  themeId: unknown,
  filenames: unknown,
): Promise<{
  ok: boolean;
  files?: { filename: string; body: string | null; size: number }[];
  message?: string;
}> {
  try {
    const store = await storeOf(readText(storeId));
    const names = Array.isArray(filenames)
      ? filenames.map((name) => readText(name)).filter(Boolean)
      : undefined;

    return { ok: true, files: await listThemeFiles(store, readText(themeId), names) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo leer el tema." };
  }
}

/**
 * Escribe en el tema.
 *
 * Falla casi siempre con un mensaje concreto —hace falta una exención de
 * Shopify además del permiso— y eso está traducido en `writeThemeFiles`. Se deja
 * construido porque en cuanto Shopify conceda la exención funciona sin tocar
 * nada.
 */
export async function writeThemeFilesAction(
  storeId: unknown,
  themeId: unknown,
  files: unknown,
): Promise<{ ok: boolean; written?: number; message?: string }> {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, message: "No hay ningún archivo que escribir." };
  }

  try {
    const store = await storeOf(readText(storeId));

    const written = await writeThemeFiles(
      store,
      readText(themeId),
      files.map((item) => {
        const file = (item ?? {}) as Record<string, unknown>;
        return { filename: readText(file.filename), content: String(file.content ?? "") };
      }),
    );

    revalidatePath("/stores");
    return { ok: true, written };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo escribir." };
  }
}
