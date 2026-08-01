import "server-only";

import { requireContext } from "@/lib/supabase/session";

/** Lo que no se deshace: escrituras en la tienda y cambios de permisos. */

export interface AuditEntry {
  id: string;
  action: string;
  target: string;
  who: string;
  createdAt: string;
}

export async function listAuditLog(limit = 30): Promise<AuditEntry[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  /*
   * El correo se busca aparte y no con un join.
   *
   * `audit_log` apunta a `auth.users`, que no se puede unir desde PostgREST, y
   * `profiles` sí es legible. Una consulta más a cambio de poder poner un nombre
   * donde si no habría un identificador que no dice nada.
   */
  const ids = [...new Set((data ?? []).map((row) => row.user_id))];
  const { data: people } = await supabase.from("profiles").select("id, email").in("id", ids);
  const byId = new Map((people ?? []).map((person) => [person.id, person.email]));

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    target: row.target,
    who: byId.get(row.user_id) ?? "",
    createdAt: row.created_at,
  }));
}
