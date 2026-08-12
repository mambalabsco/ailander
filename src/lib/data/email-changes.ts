import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Las propuestas de correo, con el cliente de sesión.
 *
 * Aquí sí protege RLS: aunque se colara un `userId` ajeno, la política de
 * `pending_email_changes` no dejaría ni verlo ni escribirlo. Por eso vive
 * aparte de `people-admin.ts`, donde no hay nada que ampare.
 */

export interface PendingEmailChange {
  userId: string;
  nuevoEmail: string;
  pedidoPor: string;
  createdAt: string;
}

const toPending = (row: {
  user_id: string;
  nuevo_email: string;
  pedido_por: string;
  created_at: string;
}): PendingEmailChange => ({
  userId: row.user_id,
  nuevoEmail: row.nuevo_email,
  pedidoPor: row.pedido_por,
  createdAt: row.created_at,
});

/**
 * Si quien mira manda sobre esa persona, preguntándoselo a la base.
 *
 * Se pregunta aquí y no se deduce del papel porque el papel es de la plataforma
 * y el mando es del espacio: un administrador de otro equipo tiene el papel y no
 * manda sobre esta persona. Y porque es la **misma** función que usan las
 * políticas, así que no puede haber dos respuestas distintas a la misma
 * pregunta.
 */
export async function mandoSobre(userId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase.rpc("mando_sobre", { persona: userId });

  // Ante la duda, no. Un fallo de red no puede convertirse en un permiso.
  if (error) return false;

  return data === true;
}

/** Las que se ven desde `/admin`: las de la gente sobre la que se manda. */
export async function pendingEmailChanges(): Promise<PendingEmailChange[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("pending_email_changes").select("*");

  return (data ?? []).map(toPending);
}

/** La propia, para el aviso de `/cuenta`. */
export async function myPendingEmailChange(): Promise<PendingEmailChange | null> {
  const { supabase, userId } = await requireContext();

  const { data } = await supabase
    .from("pending_email_changes")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return data ? toPending(data) : null;
}

export async function proposeEmailChange(userId: string, nuevoEmail: string): Promise<void> {
  const { supabase, userId: actorId } = await requireContext();

  /*
   * `upsert` y no `insert`: proponer otro correo encima de una propuesta sin
   * contestar es lo normal —se tecleó mal la primera vez— y con `insert` daría
   * un error de clave duplicada que no significa nada para quien lo lee.
   */
  const { error } = await supabase.from("pending_email_changes").upsert({
    user_id: userId,
    nuevo_email: nuevoEmail.trim().toLowerCase(),
    pedido_por: actorId,
  });

  if (error) throw new Error(error.message);
}

export async function dropEmailChange(userId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("pending_email_changes").delete().eq("user_id", userId);

  if (error) throw new Error(error.message);
}
