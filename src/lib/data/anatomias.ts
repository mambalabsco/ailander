import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { Anatomia } from "@/lib/anatomia";
import type { Json } from "@/types/database";

/**
 * Las anatomías, en `analyses`.
 *
 * En su propio módulo y no dentro de `library.ts`: esa tabla la comparte el
 * historial, cuyo tipo no tiene `payload` —la columna existe desde el principio
 * y nadie la había usado— y ensancharlo para esto obligaría a tocar una pantalla
 * que no tiene nada que ver con los ángulos.
 *
 * Sin `.eq("user_id", …)`: la política ya acota por espacio de trabajo, y ese
 * filtro estrecharía a una persona lo que es del equipo sin dar ningún error.
 */

export interface AnatomiaGuardada {
  id: string;
  title: string;
  summary: string;
  anatomia: Anatomia;
}

export async function saveAnatomia(input: {
  id?: string;
  productId: string;
  title: string;
  anatomia: Anatomia;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    title: input.title,
    kind: "anatomia",
    status: "completed",
    // El resumen es lo que se lee en una lista, y ahí la promesa dice más que
    // cualquier otra cosa: es por lo que se recuerda un anuncio.
    summary: input.anatomia.promesa,
    payload: input.anatomia as unknown as Json,
  };

  const query = input.id
    ? supabase.from("analyses").update(row).eq("id", input.id)
    : supabase.from("analyses").insert(row);

  const { data, error } = await query.select("id").single();
  if (error) throw new Error(`No se pudo guardar la anatomía: ${error.message}`);

  return data.id;
}

export async function readAnatomia(id: string): Promise<Anatomia | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("analyses")
    .select("payload")
    .eq("id", id)
    .eq("kind", "anatomia")
    .maybeSingle();

  return (data?.payload as unknown as Anatomia) ?? null;
}

export async function listAnatomias(productId: string): Promise<AnatomiaGuardada[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("analyses")
    .select("id, title, summary, payload")
    .eq("product_id", productId)
    .eq("kind", "anatomia")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    anatomia: row.payload as unknown as Anatomia,
  }));
}
