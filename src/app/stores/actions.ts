"use server";

import { revalidatePath } from "next/cache";
import { addMarket, deleteStore, findStore, removeMarket, saveStore } from "@/lib/store-registry";
import type { Store, StoreMarket, StorePlatform } from "@/types/store";
import { findCountry, findLanguage } from "@/lib/locales";

/** Las Server Actions son endpoints públicos: todo lo que llega se valida. */

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readPlatform(value: unknown): StorePlatform {
  const text = readText(value);
  return text === "shopify" || text === "woocommerce" || text === "otra" ? text : "otra";
}

function slugId(prefix: string, value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${prefix}-${slug || "sin-nombre"}-${Date.now().toString(36).slice(-4)}`;
}

/** El dominio se guarda normalizado y sin barra final, que es como se concatena. */
function normalizeDomain(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

/** El prefijo de ruta necesita barra inicial y ninguna final: `/es-mx`. */
function normalizePrefix(raw: string): string {
  const value = raw.trim().replace(/^\/+|\/+$/g, "");
  return value ? `/${value}` : "";
}

export async function createStoreAction(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = readText(raw.name);
  if (!name) throw new Error("La tienda necesita un nombre.");

  const domain = normalizeDomain(readText(raw.domain));
  if (!domain) throw new Error("La tienda necesita un dominio.");

  const countryName = readText(raw.countryName, "España");
  const languageName = readText(raw.languageName, "Español");

  const store: Store = {
    id: slugId("store", name),
    name,
    brand: readText(raw.brand) || name,
    domain,
    platform: readPlatform(raw.platform),
    mentionBrandInCopy: readBool(raw.mentionBrandInCopy, true),
    // Toda tienda nace con su mercado principal: un producto necesita uno.
    markets: [
      {
        id: slugId("mk", `${countryName}-${languageName}`),
        countryCode: readText(raw.countryCode, "ES").toUpperCase().slice(0, 2),
        countryName,
        languageCode: readText(raw.languageCode, "es").toLowerCase().slice(0, 5),
        languageName,
        currency: readText(raw.currency, "EUR").toUpperCase().slice(0, 3),
        pathPrefix: "",
        isPrimary: true,
      },
    ],
    createdAt: new Date().toISOString(),
  };

  await saveStore(store);
  revalidatePath("/stores");
  revalidatePath("/products");
  return store;
}

export async function updateStoreAction(storeId: string, patch: unknown) {
  const store = await findStore(readText(storeId));
  if (!store) throw new Error("No se encontró la tienda.");

  const raw = (patch ?? {}) as Record<string, unknown>;
  const domain = readText(raw.domain);

  const updated: Store = {
    ...store,
    name: readText(raw.name) || store.name,
    brand: readText(raw.brand) || store.brand,
    domain: domain ? normalizeDomain(domain) : store.domain,
    platform: raw.platform === undefined ? store.platform : readPlatform(raw.platform),
    mentionBrandInCopy: readBool(raw.mentionBrandInCopy, store.mentionBrandInCopy),
  };

  await saveStore(updated);
  revalidatePath("/stores");
  revalidatePath("/products");
  return updated;
}

export async function addMarketAction(storeId: string, input: unknown) {
  const id = readText(storeId);
  if (!id) throw new Error("Falta la tienda.");

  const raw = (input ?? {}) as Record<string, unknown>;
  const countryName = readText(raw.countryName);
  const languageName = readText(raw.languageName);
  if (!countryName || !languageName) {
    throw new Error("Un mercado necesita país e idioma.");
  }

  const store = await findStore(id);
  if (!store) throw new Error("No se encontró la tienda.");

  /*
   * Los códigos, deducidos del nombre cuando no vienen.
   *
   * **Aquí estaba el fallo que impedía añadir mercados.** El formulario recoge
   * el nombre del idioma —«Español»— y no tiene campo para su código, así que
   * llegaba `""`. Y `readText` solo aplica su valor por defecto cuando lo que
   * recibe **no es una cadena**: una cadena vacía sí lo es, así que el `"es"` de
   * reserva no entraba nunca y se intentaba insertar un código vacío en una
   * columna con `check (char_length(language_code) between 2 and 5)`.
   *
   * Postgres rechazaba la fila y en producción eso sale como un error genérico
   * de render: el mercado no se añadía y no había forma de saber por qué.
   *
   * Se deduce del nombre en vez de caer a un idioma fijo porque «Português» con
   * un `es` de reserva daría un mercado que dice hablar español, y eso no falla:
   * se queda ahí, y los copys salen en el idioma equivocado.
   */
  const countryCode = (
    readText(raw.countryCode) ||
    findCountry(countryName)?.code ||
    ""
  )
    .toUpperCase()
    .slice(0, 2);

  const languageCode = (
    readText(raw.languageCode) ||
    findLanguage(languageName)?.code ||
    ""
  )
    .toLowerCase()
    .slice(0, 5);

  if (countryCode.length < 2) {
    throw new Error(
      `No reconozco el país «${countryName}». Escribe su código de dos letras, por ejemplo MX.`,
    );
  }

  if (languageCode.length < 2) {
    throw new Error(
      `No reconozco el idioma «${languageName}». Elígelo de la lista, por ejemplo Español.`,
    );
  }

  const duplicate = store.markets.some(
    (market) => market.countryCode === countryCode && market.languageCode === languageCode,
  );
  if (duplicate) {
    throw new Error("Ese país e idioma ya existen en esta tienda.");
  }

  const market: StoreMarket = {
    id: slugId("mk", `${countryCode}-${languageCode}`),
    countryCode,
    countryName,
    languageCode,
    languageName,
    currency: readText(raw.currency, "EUR").toUpperCase().slice(0, 3),
    domain: normalizeDomain(readText(raw.domain)) || undefined,
    pathPrefix: normalizePrefix(readText(raw.pathPrefix)),
    isPrimary: readBool(raw.isPrimary),
  };

  const updated = await addMarket(id, market);
  revalidatePath("/stores");
  revalidatePath("/products");
  return updated;
}

export async function removeMarketAction(storeId: string, marketId: string) {
  const id = readText(storeId);
  const market = readText(marketId);
  if (!id || !market) throw new Error("Faltan la tienda o el mercado.");

  const removed = await removeMarket(id, market);
  if (!removed) throw new Error("No se encontró el mercado que intentas quitar.");

  revalidatePath("/stores");
  revalidatePath("/products");
  return true;
}

export async function deleteStoreAction(storeId: string) {
  const removed = await deleteStore(readText(storeId));
  if (!removed) {
    throw new Error("No se puede borrar: es la única tienda que queda.");
  }
  revalidatePath("/stores");
  revalidatePath("/products");
  return true;
}

/**
 * Guarda el token de Shopify de una tienda.
 *
 * Acción aparte de la edición general **a propósito**: el token nunca vuelve al
 * navegador, así que el formulario de la tienda no lo tiene. Si viajara con el
 * resto de campos, cada edición de cualquier otro dato lo sobrescribiría con la
 * cadena vacía y lo borraría sin que nadie se diera cuenta.
 */
/** Guarda la clave y el secreto de la app de Shopify de una tienda. */
export async function saveStoreAppAction(storeId: unknown, apiKey: unknown, apiSecret: unknown) {
  const id = typeof storeId === "string" ? storeId.trim() : "";
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  const secret = typeof apiSecret === "string" ? apiSecret.trim() : "";

  if (!id) throw new Error("Falta la tienda.");
  if (!key || !secret) throw new Error("Hacen falta la clave y el secreto de la app.");

  const { updateStore } = await import("@/lib/data/stores");
  await updateStore(id, { shopifyApiKey: key, shopifyApiSecret: secret });

  revalidatePath("/stores");
}

export async function saveStoreTokenAction(storeId: unknown, token: unknown) {
  const id = typeof storeId === "string" ? storeId.trim() : "";
  const value = typeof token === "string" ? token.trim() : "";

  if (!id) throw new Error("Falta la tienda.");
  if (!value) throw new Error("Pega el token antes de guardar.");

  const { updateStore } = await import("@/lib/data/stores");
  await updateStore(id, { shopifyAdminToken: value });

  revalidatePath("/stores");
}
