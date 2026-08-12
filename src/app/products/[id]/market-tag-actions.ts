"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/supabase/session";

/*
 * La lista blanca no es paranoia de seguridad —RLS ya acota—: es que un nombre
 * de tabla que llegue del navegador y no esté aquí falla con un mensaje que se
 * entiende, en vez de con uno de PostgREST sobre una relación que no existe.
 *
 * `performance_records` **no puede estar** en esta lista, y no es un olvido: el
 * rendimiento es del mercado donde se midió. Lo que funcionó en Chile es una
 * hipótesis en México, no un dato, y marcarlo como válido en todos los mercados
 * convertiría una hipótesis en una cifra con aspecto de comprobada.
 */
const ETIQUETABLES = [
  "copies",
  "angles",
  "hooks",
  "short_ads",
  "landing_pages",
  "prelandings",
  "landing_experiments",
  "videos",
  "product_images",
  "campaigns",
] as const;

type Etiquetable = (typeof ETIQUETABLES)[number];

export interface TagResult {
  ok: boolean;
  message: string;
}

/**
 * Marca una pieza como «vale en todos los mercados».
 *
 * A general **solo se llega a propósito**, con este botón. Nada nace general por
 * descuido: una pieza mal marcada se publicaría en el país equivocado, y ese es
 * exactamente el error que todo esto existe para evitar.
 */
export async function promoteToGeneralAction(
  table: string,
  id: string,
  productId: string,
): Promise<TagResult> {
  if (!ETIQUETABLES.includes(table as Etiquetable)) {
    return { ok: false, message: "Esa lista no lleva mercado." };
  }

  const { supabase } = await requireContext();

  const { error } = await supabase
    .from(table as Etiquetable)
    .update({ market_id: null })
    .eq("id", id);

  if (error) return { ok: false, message: `No se pudo marcar: ${error.message}` };

  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Marcada como válida en todos los mercados." };
}

/** Lo contrario: atar una pieza general a un mercado concreto. */
export async function assignToMarketAction(
  table: string,
  id: string,
  productId: string,
  marketId: string,
): Promise<TagResult> {
  if (!ETIQUETABLES.includes(table as Etiquetable)) {
    return { ok: false, message: "Esa lista no lleva mercado." };
  }
  if (!marketId) return { ok: false, message: "Falta el mercado." };

  const { supabase } = await requireContext();

  const { error } = await supabase
    .from(table as Etiquetable)
    .update({ market_id: marketId })
    .eq("id", id);

  if (error) return { ok: false, message: `No se pudo marcar: ${error.message}` };

  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Atada a ese mercado." };
}
