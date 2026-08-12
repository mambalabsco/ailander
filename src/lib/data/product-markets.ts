import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { MarketPrice, PriceSource } from "@/lib/market-price";

/**
 * En qué mercados vive un producto y a qué precio en cada uno.
 *
 * Sin `.eq("user_id", …)` en ninguna lectura: la política ya acota por espacio de
 * trabajo, y ese filtro no falla —devuelve cero filas y a quien invitas le
 * aparece la ficha sin mercados—.
 */

export async function listProductMarkets(productId: string): Promise<MarketPrice[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("product_markets")
    .select("market_id, price, price_source, price_fx_day, price_fx_rate")
    .eq("product_id", productId);

  if (error) throw new Error(`No se pudieron leer los mercados del producto: ${error.message}`);

  return (data ?? []).map((row) => ({
    marketId: row.market_id,
    // `numeric` llega como número o como cadena según el driver; se normaliza.
    price: row.price === null ? null : Number(row.price),
    source: row.price_source as PriceSource,
    fxDay: row.price_fx_day ? String(row.price_fx_day).slice(0, 10) : null,
    fxRate: row.price_fx_rate === null ? null : Number(row.price_fx_rate),
  }));
}

export async function addProductMarket(productId: string, marketId: string): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .insert({ product_id: productId, market_id: marketId, user_id: userId });

  // Añadir dos veces el mismo mercado es un doble clic, no un error que merezca
  // una pantalla roja: la restricción de unicidad ya lo impidió.
  if (error && !error.message.includes("duplicate key")) {
    throw new Error(`No se pudo añadir el mercado: ${error.message}`);
  }
}

export async function removeProductMarket(productId: string, marketId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .delete()
    .eq("product_id", productId)
    .eq("market_id", marketId);

  if (error) throw new Error(`No se pudo quitar el mercado: ${error.message}`);
}

/**
 * El precio escrito a mano.
 *
 * Borra el rastro de la conversión a propósito: si se quedara, la pantalla
 * seguiría diciendo «convertido el 1 de julio» sobre un número que escribió una
 * persona hoy.
 */
export async function setManualPrice(
  productId: string,
  marketId: string,
  price: number,
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .update({ price, price_source: "manual", price_fx_day: null, price_fx_rate: null })
    .eq("product_id", productId)
    .eq("market_id", marketId);

  if (error) throw new Error(`No se pudo guardar el precio: ${error.message}`);
}

/**
 * El precio convertido, con su cambio congelado.
 *
 * **No toca las filas manuales.** El `.neq("price_source", "manual")` no es una
 * comodidad: es lo que impide que recalcular los cambios de una tienda entera se
 * lleve por delante los precios redondeados a mano de cada país.
 */
export async function setConvertedPrice(
  productId: string,
  marketId: string,
  value: { price: number; fxDay: string; fxRate: number },
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_markets")
    .update({
      price: value.price,
      price_source: "convertido",
      price_fx_day: value.fxDay,
      price_fx_rate: value.fxRate,
    })
    .eq("product_id", productId)
    .eq("market_id", marketId)
    .neq("price_source", "manual");

  if (error) throw new Error(`No se pudo guardar la conversión: ${error.message}`);
}
