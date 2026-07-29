import { promises as fs } from "fs";
import path from "path";
import type { Store, StoreMarket } from "@/types/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/stores";

/**
 * Registro de tiendas.
 *
 * Se siembra con una tienda por defecto la primera vez, para que los productos
 * que ya existen tengan dónde colgar sin migración manual.
 */

const dataRoot = path.join(process.cwd(), "data");
const storesPath = path.join(dataRoot, "stores.json");

export const DEFAULT_STORE_ID = "store-principal";

function defaultStore(): Store {
  return {
    id: DEFAULT_STORE_ID,
    name: "Tienda principal",
    brand: "Lumen Lab",
    domain: "https://example.com",
    platform: "shopify",
    mentionBrandInCopy: true,
    markets: [
      {
        id: "mk-es",
        countryCode: "ES",
        countryName: "España",
        languageCode: "es",
        languageName: "Español",
        currency: "EUR",
        pathPrefix: "",
        isPrimary: true,
      },
    ],
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

async function readAll(): Promise<Store[]> {
  try {
    const raw = await fs.readFile(storesPath, "utf8");
    const parsed = JSON.parse(raw) as Store[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Sin archivo todavía.
  }
  return [defaultStore()];
}

async function writeAll(stores: Store[]) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(storesPath, JSON.stringify(stores, null, 2), "utf8");
}

export async function listStores(): Promise<Store[]> {
  if (isSupabaseConfigured()) return db.listStores();
  return readAll();
}

export async function findStore(id: string): Promise<Store | null> {
  if (isSupabaseConfigured()) return db.findStore(id);
  const stores = await readAll();
  return stores.find((store) => store.id === id) ?? stores[0] ?? null;
}

export async function saveStore(store: Store): Promise<Store> {
  if (isSupabaseConfigured()) {
    const existing = store.id ? await db.findStore(store.id) : null;
    if (existing && existing.id === store.id) {
      const updated = await db.updateStore(store.id, store);
      if (updated) return updated;
    }
    return db.createStore({
      name: store.name,
      brand: store.brand,
      domain: store.domain,
      platform: store.platform,
      mentionBrandInCopy: store.mentionBrandInCopy,
      shopifyAdminToken: store.shopifyAdminToken,
      market: store.markets[0],
    });
  }

  const stores = await readAll();
  const index = stores.findIndex((item) => item.id === store.id);
  if (index >= 0) stores[index] = store;
  else stores.push(store);
  await writeAll(stores);
  return store;
}

export async function deleteStore(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return db.deleteStore(id);

  const stores = await readAll();
  const remaining = stores.filter((store) => store.id !== id);
  // Nunca se queda sin ninguna: los productos necesitan una a la que colgar.
  if (remaining.length === 0 || remaining.length === stores.length) return false;
  await writeAll(remaining);
  return true;
}

export async function addMarket(storeId: string, market: StoreMarket): Promise<Store | null> {
  if (isSupabaseConfigured()) return db.addMarket(storeId, market);

  const store = await findStore(storeId);
  if (!store) return null;

  const markets = market.isPrimary
    ? [...store.markets.map((item) => ({ ...item, isPrimary: false })), market]
    : [...store.markets, market];

  return saveStore({ ...store, markets });
}

export async function removeMarket(storeId: string, marketId: string): Promise<boolean> {
  if (isSupabaseConfigured()) return db.removeMarket(storeId, marketId);

  const store = await findStore(storeId);
  if (!store) return false;

  const remaining = store.markets.filter((market) => market.id !== marketId);
  // Una tienda sin mercados dejaría a sus productos sin país ni idioma.
  if (remaining.length === 0) {
    throw new Error("Una tienda no puede quedarse sin mercados.");
  }

  // Si se borró el principal, asciende el primero que quede.
  if (!remaining.some((market) => market.isPrimary)) {
    remaining[0] = { ...remaining[0], isPrimary: true };
  }

  const stores = await readAll();
  const index = stores.findIndex((item) => item.id === storeId);
  if (index < 0) return false;
  stores[index] = { ...stores[index], markets: remaining };
  await writeAll(stores);
  return true;
}

/** Mercado principal, o el primero si ninguno está marcado. */
export function primaryMarket(store: Store): StoreMarket | undefined {
  return store.markets.find((market) => market.isPrimary) ?? store.markets[0];
}
