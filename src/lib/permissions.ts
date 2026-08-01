import "server-only";

import { currentProfile, spentThisMonth, type Profile } from "@/lib/data/profiles";
import { requireContext } from "@/lib/supabase/session";
import { can, spendCheck, type Capability } from "@/lib/roles";

/**
 * Exigir permiso, pegado al dato.
 *
 * ## Por qué aquí y no en el menú
 *
 * Ocultar un botón no protege nada: la acción de servidor sigue estando ahí y se
 * puede llamar directamente. El menú se recorta para no enseñar lo que no se
 * puede usar —eso es cortesía— y **esto** es lo que impide hacerlo.
 *
 * Va en cada acción que gasta, publica o toca secretos. Es una consulta más por
 * acción, cacheada por petición, a cambio de que no haya forma de saltárselo.
 */

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

/**
 * El perfil de quien pide, exigiendo que esté activo.
 *
 * Una cuenta desactivada conserva su sesión hasta que caduca, así que sin esta
 * comprobación seguiría trabajando después de que alguien la desactivara — que
 * es justo el momento en el que no debería.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await currentProfile();

  if (!profile) {
    throw new PermissionError(
      "Tu cuenta todavía no tiene perfil. Pídele a un administrador que te lo asigne.",
    );
  }

  if (profile.disabled) {
    throw new PermissionError("Tu cuenta está desactivada. Habla con un administrador.");
  }

  return profile;
}

/** Exige un permiso concreto y devuelve el perfil, que casi siempre hace falta. */
export async function requireCapability(capability: Capability): Promise<Profile> {
  const profile = await requireProfile();

  if (!can(profile.role, capability)) {
    throw new PermissionError(
      `Tu papel (${profile.role}) no permite esto. Pídeselo a un administrador.`,
    );
  }

  return profile;
}

/**
 * Exige poder gastar **y** que quede presupuesto.
 *
 * Se comprueba antes de lanzar y no después: un trabajo que arranca ya está
 * pagado en cuanto llama al modelo, así que avisar al terminar no evitaría nada.
 */
export async function requireBudget(): Promise<Profile> {
  const profile = await requireCapability("gastar");

  const spent = await spentThisMonth(profile.id);
  const check = spendCheck({
    role: profile.role,
    limitUsd: profile.monthlyLimitUsd,
    spentUsd: spent,
  });

  if (!check.ok) throw new PermissionError(check.reason);

  return profile;
}

/** Si alguien tiene un permiso, sin lanzar. Para decidir qué dibujar. */
export async function hasCapability(capability: Capability): Promise<boolean> {
  const profile = await currentProfile();
  return Boolean(profile && !profile.disabled && can(profile.role, capability));
}

/* ------------------------------- El registro ------------------------------- */

/**
 * Deja anotado lo que no se deshace.
 *
 * Solo lo que ven los clientes o cambia lo que otros pueden hacer: escribir en un
 * tema, publicar una página, cambiarle el papel a alguien. Anotarlo todo llenaría
 * el registro de ruido y haría inútil el ejercicio de mirarlo.
 *
 * No falla hacia fuera: perder una línea del registro no puede impedir la acción
 * que ya se hizo.
 */
export async function record(
  action: string,
  target: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { supabase, userId } = await requireContext();
    await supabase.from("audit_log").insert({ user_id: userId, action, target, detail });
  } catch {
    return;
  }
}
