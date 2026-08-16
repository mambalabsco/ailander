import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { CampaignFolder } from "@/types/campaign";
import type { Tables } from "@/types/database";

/**
 * Carpetas para ordenar las campañas de un producto.
 *
 * Sin `.eq("user_id", …)` en las lecturas: la política ya acota por espacio de
 * trabajo, y ese filtro estrecharía a una persona lo que es del equipo sin dar
 * ningún error — devolvería cero filas y la barra saldría vacía.
 */

function toFolder(row: Tables<"campaign_folders">): CampaignFolder {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
  };
}

export async function readCampaignFolders(productId: string): Promise<CampaignFolder[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("campaign_folders")
    .select("*")
    .eq("product_id", productId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las carpetas: ${error.message}`);

  return (data ?? []).map(toFolder);
}

export async function saveCampaignFolder(input: {
  id?: string;
  productId: string;
  name: string;
  position?: number;
}): Promise<CampaignFolder> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    name: input.name,
    position: input.position ?? 0,
  };

  const query = input.id
    ? supabase.from("campaign_folders").update(row).eq("id", input.id)
    : supabase.from("campaign_folders").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar la carpeta: ${error.message}`);

  return toFolder(data);
}

/**
 * Borra una carpeta.
 *
 * Las campañas que había dentro **no se van con ella**: su `folder_id` queda a
 * nulo, que es lo que dice el `on delete set null` de la migración. Vuelven a
 * «Sin carpeta», que es lo que sobra, no el trabajo.
 */
export async function deleteCampaignFolder(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("campaign_folders").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar la carpeta: ${error.message}`);
}
