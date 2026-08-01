import "server-only";

import { cache } from "react";
import { requireContext } from "@/lib/supabase/session";
import { isRole, type Role } from "@/lib/roles";

/**
 * Quién es cada uno y qué puede.
 *
 * El reparto de permisos vive en `roles.ts` —puro y probado—; aquí solo se lee
 * qué papel tiene cada cuenta y cuánto lleva gastado.
 */

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Tope de gasto al mes en dólares. `null` es sin tope. */
  monthlyLimitUsd: number | null;
  disabled: boolean;
  createdAt: string;
}

function toProfile(row: {
  id: string;
  email: string;
  display_name: string;
  role: string;
  monthly_limit_usd: number | null;
  disabled: boolean;
  created_at: string;
}): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    /*
     * Un papel que no se reconozca se lee como invitado.
     *
     * Es el lado seguro: si alguien mete a mano un papel inventado en la base de
     * datos, la plataforma no le da permisos que no sabe interpretar. Al revés
     * sería conceder por accidente.
     */
    role: isRole(row.role) ? row.role : "invitado",
    // `numeric` llega como texto desde PostgREST.
    monthlyLimitUsd: row.monthly_limit_usd === null ? null : Number(row.monthly_limit_usd),
    disabled: row.disabled,
    createdAt: row.created_at,
  };
}

/**
 * El perfil de quien está pidiendo.
 *
 * En `cache()` porque lo consulta cada comprobación de permiso y una página hace
 * varias: sin esto sería una consulta por botón dibujado.
 */
export const currentProfile = cache(async (): Promise<Profile | null> => {
  const { supabase, userId } = await requireContext();

  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data ? toProfile(data) : null;
});

/** Todos, para la pantalla de administración. RLS ya filtra quién puede verlos. */
export async function listProfiles(): Promise<Profile[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las personas: ${error.message}`);

  return (data ?? []).map(toProfile);
}

export async function findProfile(id: string): Promise<Profile | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return data ? toProfile(data) : null;
}

export async function updateProfile(
  id: string,
  patch: { role?: Role; monthlyLimitUsd?: number | null; disabled?: boolean; name?: string },
): Promise<void> {
  const { supabase } = await requireContext();

  const row: Partial<{
    role: string;
    monthly_limit_usd: number | null;
    disabled: boolean;
    display_name: string;
  }> = {};
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.monthlyLimitUsd !== undefined) row.monthly_limit_usd = patch.monthlyLimitUsd;
  if (patch.disabled !== undefined) row.disabled = patch.disabled;
  if (patch.name !== undefined) row.display_name = patch.name;

  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from("profiles").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

/* --------------------------------- El gasto -------------------------------- */

/** El primer día del mes en curso, que es donde empieza a contar el límite. */
function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Lo gastado este mes por una persona.
 *
 * Sale de los trabajos, que es donde se anota lo que costó cada generación. No
 * hay contador aparte: un contador que se actualiza por su cuenta se desincroniza
 * el día que un trabajo falla a medias, y entonces frena a alguien que no había
 * gastado.
 */
export async function spentThisMonth(userId: string): Promise<number> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", monthStart());

  if (error) return 0;

  return (data ?? []).reduce((total, row) => total + Number(row.cost_usd ?? 0), 0);
}
