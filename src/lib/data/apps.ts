import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { CasinoApp } from "@/types/app";
import type { Tables } from "@/types/database";

/**
 * Las apps de un producto de casino.
 *
 * Sin `.eq("user_id", …)` en las lecturas: la política ya acota por espacio de
 * trabajo, y ese filtro estrecharía a una persona lo que es del equipo sin dar
 * ningún error — devolvería cero filas y la pantalla saldría vacía.
 */

function toApp(row: Tables<"apps">): CasinoApp {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    focus: row.focus,
    downloadUrl: row.download_url,
    position: row.position,
    createdAt: row.created_at,
  };
}

export async function listApps(productId: string): Promise<CasinoApp[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("apps")
    .select("*")
    .eq("product_id", productId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las apps: ${error.message}`);

  return (data ?? []).map(toApp);
}

export async function saveApp(input: {
  id?: string;
  productId: string;
  name: string;
  focus: string;
  downloadUrl: string;
  position?: number;
}): Promise<CasinoApp> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    name: input.name,
    focus: input.focus,
    download_url: input.downloadUrl,
    position: input.position ?? 0,
  };

  const query = input.id
    ? supabase.from("apps").update(row).eq("id", input.id)
    : supabase.from("apps").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar la app: ${error.message}`);

  return toApp(data);
}

/**
 * Borra una app.
 *
 * Los copys, los ángulos y las imágenes que la citaban **no se van con ella**:
 * su `app_id` queda a nulo, que es lo que dice la migración. Pierden la
 * referencia, que es lo que sobra, no el trabajo.
 */
export async function deleteApp(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("apps").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar la app: ${error.message}`);
}
