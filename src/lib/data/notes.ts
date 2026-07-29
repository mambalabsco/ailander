import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { Tables, TablesUpdate } from "@/types/database";
import type { ProductNote } from "@/types/note";

export type { ProductNote } from "@/types/note";

/**
 * Notas manuales del producto.
 *
 * Son las cosas que sabe quien lleva la cuenta y no salen de ninguna
 * investigación: una restricción legal del país, una promesa que el fabricante
 * no deja hacer, lo que contó el proveedor, una objeción concreta que aparece
 * en los comentarios. Se escriben a mano y viajan dentro de los prompts.
 *
 * `includeInPrompts` permite guardar apuntes internos sin que condicionen lo
 * que escribe el modelo. Sin ese interruptor, la única forma de tener una nota
 * privada sería no escribirla.
 */

function toNote(row: Tables<"product_notes">): ProductNote {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title,
    body: row.body,
    includeInPrompts: row.include_in_prompts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listNotes(productId: string): Promise<ProductNote[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("product_notes")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las notas: ${error.message}`);
  return (data ?? []).map(toNote);
}

export async function createNote(input: {
  productId: string;
  title: string;
  body: string;
  includeInPrompts: boolean;
}): Promise<ProductNote> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("product_notes")
    .insert({
      user_id: userId,
      product_id: input.productId,
      title: input.title,
      body: input.body,
      include_in_prompts: input.includeInPrompts,
    })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo guardar la nota: ${error.message}`);
  return toNote(data);
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<ProductNote, "title" | "body" | "includeInPrompts">>,
): Promise<ProductNote | null> {
  const { supabase } = await requireContext();

  const changes: TablesUpdate<"product_notes"> = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.body !== undefined) changes.body = patch.body;
  if (patch.includeInPrompts !== undefined) changes.include_in_prompts = patch.includeInPrompts;

  if (Object.keys(changes).length === 0) return null;

  const { data, error } = await supabase
    .from("product_notes")
    .update(changes)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`No se pudo actualizar la nota: ${error.message}`);
  return data ? toNote(data) : null;
}

export async function deleteNote(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("product_notes")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo borrar la nota: ${error.message}`);
  return (count ?? 0) > 0;
}
