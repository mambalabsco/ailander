import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { toStore } from "@/lib/data/mappers";
import type { Store, StoreMarket } from "@/types/store";
import type { TablesUpdate } from "@/types/database";

/**
 * Tiendas y mercados en Supabase.
 *
 * Se leen en una sola consulta con `select` anidado. La alternativa —una
 * consulta para las tiendas y otra por cada una para sus mercados— es el
 * problema N+1 de manual, y con diez tiendas ya se nota.
 */

export async function listStores(): Promise<Store[]> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("stores")
    .select("*, store_markets(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las tiendas: ${error.message}`);

  return (data ?? []).map((row) => {
    const { store_markets: markets, ...store } = row;
    // El principal primero, y el resto por país, que es como se leen.
    const sorted = [...(markets ?? [])].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.country_name.localeCompare(b.country_name, "es");
    });
    return toStore(store, sorted);
  });
}

export async function findStore(id: string): Promise<Store | null> {
  const stores = await listStores();
  return stores.find((store) => store.id === id) ?? stores[0] ?? null;
}

export async function createStore(input: {
  name: string;
  brand: string;
  domain: string;
  platform: Store["platform"];
  mentionBrandInCopy: boolean;
  /** Token de la app personalizada de esta tienda, si ya lo tienes. */
  shopifyAdminToken?: string;
  market: Omit<StoreMarket, "id">;
}): Promise<Store> {
  const { supabase, userId } = await requireContext();

  const { data: store, error } = await supabase
    .from("stores")
    .insert({
      user_id: userId,
      name: input.name,
      brand: input.brand,
      domain: input.domain,
      platform: input.platform,
      mention_brand_in_copy: input.mentionBrandInCopy,
      shopify_admin_token: input.shopifyAdminToken || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo crear la tienda: ${error.message}`);

  // Toda tienda nace con su mercado principal: un producto necesita uno para
  // saber su país, su idioma y su moneda.
  const { error: marketError } = await supabase.from("store_markets").insert({
    user_id: userId,
    store_id: store.id,
    country_code: input.market.countryCode,
    country_name: input.market.countryName,
    language_code: input.market.languageCode,
    language_name: input.market.languageName,
    currency: input.market.currency,
    domain: input.market.domain ?? "",
    path_prefix: input.market.pathPrefix,
    is_primary: true,
  });

  if (marketError) {
    // Sin mercado la tienda es inservible, así que no se deja a medias.
    await supabase.from("stores").delete().eq("id", store.id);
    throw new Error(`No se pudo crear el mercado principal: ${marketError.message}`);
  }

  const created = await findStore(store.id);
  if (!created) throw new Error("La tienda se creó pero no se pudo volver a leer.");
  return created;
}

export async function updateStore(
  id: string,
  patch: Partial<
    Pick<
      Store,
      | "name"
      | "brand"
      | "domain"
      | "platform"
      | "mentionBrandInCopy"
      | "shopifyAdminToken"
      | "shopifyShopDomain"
      | "shopifyApiKey"
      | "shopifyApiSecret"
    >
  >,
): Promise<Store | null> {
  const { supabase } = await requireContext();

  const changes: TablesUpdate<"stores"> = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.brand !== undefined) changes.brand = patch.brand;
  if (patch.domain !== undefined) changes.domain = patch.domain;
  if (patch.platform !== undefined) changes.platform = patch.platform;
  if (patch.mentionBrandInCopy !== undefined) {
    changes.mention_brand_in_copy = patch.mentionBrandInCopy;
  }

  /*
   * El token solo se toca si llega uno nuevo.
   *
   * El formulario nunca recibe el guardado —no sale al navegador—, así que
   * grabar la cadena vacía que trae por defecto lo borraría cada vez que se
   * edita cualquier otro campo de la tienda.
   */
  if (patch.shopifyAdminToken) {
    changes.shopify_admin_token = patch.shopifyAdminToken;
  }
  if (patch.shopifyShopDomain) changes.shopify_shop_domain = patch.shopifyShopDomain;
  if (patch.shopifyApiKey) changes.shopify_api_key = patch.shopifyApiKey;
  if (patch.shopifyApiSecret) changes.shopify_api_secret = patch.shopifyApiSecret;

  if (Object.keys(changes).length === 0) return findStore(id);

  const { error } = await supabase.from("stores").update(changes).eq("id", id);
  if (error) throw new Error(`No se pudo actualizar la tienda: ${error.message}`);

  return findStore(id);
}

export async function deleteStore(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase.from("stores").delete({ count: "exact" }).eq("id", id);
  if (error) throw new Error(`No se pudo borrar la tienda: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function addMarket(storeId: string, market: Omit<StoreMarket, "id">): Promise<Store | null> {
  const { supabase, userId } = await requireContext();

  // El índice único de "un solo principal por tienda" rechazaría el insert, así
  // que el anterior se degrada primero.
  if (market.isPrimary) {
    const { error } = await supabase
      .from("store_markets")
      .update({ is_primary: false })
      .eq("store_id", storeId);
    if (error) throw new Error(`No se pudo reasignar el mercado principal: ${error.message}`);
  }

  const { error } = await supabase.from("store_markets").insert({
    user_id: userId,
    store_id: storeId,
    country_code: market.countryCode,
    country_name: market.countryName,
    language_code: market.languageCode,
    language_name: market.languageName,
    currency: market.currency,
    domain: market.domain ?? "",
    path_prefix: market.pathPrefix,
    is_primary: market.isPrimary,
  });

  if (error) {
    // 23505 es violación de unicidad: ese país e idioma ya existen en la tienda.
    if (error.code === "23505") {
      throw new Error("Ese país e idioma ya existen en esta tienda.");
    }
    throw new Error(`No se pudo añadir el mercado: ${error.message}`);
  }

  return findStore(storeId);
}

export async function removeMarket(storeId: string, marketId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const store = await findStore(storeId);
  if (!store) return false;
  if (store.markets.length <= 1) {
    throw new Error("Una tienda no puede quedarse sin mercados.");
  }

  const { error } = await supabase.from("store_markets").delete().eq("id", marketId);
  if (error) throw new Error(`No se pudo quitar el mercado: ${error.message}`);

  // Si se fue el principal, asciende el primero que quede.
  const remaining = await findStore(storeId);
  if (remaining && !remaining.markets.some((item) => item.isPrimary) && remaining.markets[0]) {
    await supabase
      .from("store_markets")
      .update({ is_primary: true })
      .eq("id", remaining.markets[0].id);
  }

  return true;
}
