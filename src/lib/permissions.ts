import "server-only";

import { currentProfile, spentThisMonth, type Profile } from "@/lib/data/profiles";
import { requireContext } from "@/lib/supabase/session";
import { spendCheck, type Capability } from "@/lib/roles";

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

/**
 * Lo que puede quien está mirando, con sus excepciones ya aplicadas.
 *
 * El papel es el punto de partida; si en su equipo le hicieron una excepción,
 * manda esa. Preguntando solo por el papel, las excepciones se guardarían, se
 * verían en la pantalla de equipo y no harían nada — que es peor que no
 * tenerlas, porque quien las pone se queda tranquilo.
 *
 * Si la consulta falla se cae al papel en vez de quedarse sin permisos: una
 * base de datos lenta no debería dejar a nadie sin poder trabajar, y el papel
 * ya es una respuesta segura.
 */
export async function capabilitiesOfProfile(profile: Profile): Promise<Capability[]> {
  try {
    const { activeMembership } = await import("@/lib/data/workspace");
    const { capabilitiesFor } = await import("@/lib/roles");

    const membership = await activeMembership();

    return capabilitiesFor(profile.role, membership?.capabilities ?? null);
  } catch {
    const { capabilitiesOf } = await import("@/lib/roles");

    return capabilitiesOf(profile.role);
  }
}

/** Exige un permiso concreto y devuelve el perfil, que casi siempre hace falta. */
export async function requireCapability(capability: Capability): Promise<Profile> {
  const profile = await requireProfile();

  if (!(await capabilitiesOfProfile(profile)).includes(capability)) {
    throw new PermissionError(
      `No tienes permiso para esto. Pídeselo a un administrador de tu equipo.`,
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
  if (!profile || profile.disabled) return false;

  return (await capabilitiesOfProfile(profile)).includes(capability);
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

/**
 * Lo que puede quien está mirando ahora mismo, sin pedir el perfil aparte.
 *
 * Lo usa el menú, que se pinta en cada página: sin perfil o desactivado, nada —
 * enseñar un menú lleno a quien no puede entrar a ninguna de esas pantallas es
 * una promesa que se rompe al primer clic.
 */
export async function capabilitiesNow(): Promise<Capability[]> {
  const profile = await currentProfile().catch(() => null);

  if (!profile || profile.disabled) return [];

  return capabilitiesOfProfile(profile);
}
