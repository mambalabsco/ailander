"use server";

import { revalidatePath } from "next/cache";
import { canAssign, canDisable, canManageAccount, isRole, type Role } from "@/lib/roles";
import { record, requireCapability, requireProfile } from "@/lib/permissions";
import { findProfile, updateProfile, type Profile } from "@/lib/data/profiles";
import { emailProblem, passwordProblem } from "@/lib/account-rules";
import { mandoSobre, proposeEmailChange } from "@/lib/data/email-changes";
import { setPassword } from "@/lib/data/people-admin";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";

/**
 * Gestionar personas.
 *
 * Las reglas de quién puede tocar a quién viven en `roles.ts` —puras y
 * probadas— y aquí solo se aplican. La base de datos las repite por debajo con
 * sus políticas: si algo se colara por aquí, allí no pasa.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function setRoleAction(
  userId: unknown,
  role: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  const next = readText(role);

  if (!id || !isRole(next)) return { ok: false, message: "Falta la persona o el papel." };

  try {
    const actor = await requireCapability("personas");
    const target = await findProfile(id);
    if (!target) return { ok: false, message: "Esa persona ya no existe." };

    const allowed = canAssign(actor, target, next);
    if (!allowed.ok) return { ok: false, message: allowed.reason };

    await updateProfile(id, { role: next as Role });
    await record("persona.papel", target.email || id, { de: target.role, a: next });

    revalidatePath("/admin");
    return { ok: true, message: `${target.email || "La persona"} ahora es ${next}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo cambiar." };
  }
}

/**
 * El tope de gasto del mes.
 *
 * Vacío es sin tope, y se reserva para quien paga la factura: ponerle límite a
 * esa persona solo sirve para bloquearle el trabajo un domingo.
 */
export async function setLimitAction(
  userId: unknown,
  limit: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  const raw = readText(limit);
  const value = raw === "" ? null : Number(raw);

  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, message: "El tope tiene que ser un número de dólares, o vacío." };
  }

  try {
    const actor = await requireCapability("personas");
    const target = await findProfile(id);
    if (!target) return { ok: false, message: "Esa persona ya no existe." };

    /*
     * A uno mismo no se le sube el tope.
     *
     * Es la misma puerta de atrás que la del papel: sin esto, cualquiera con
     * permiso de gestionar personas se quita su propio límite y el límite deja
     * de significar nada.
     */
    if (actor.id === id) {
      return { ok: false, message: "No puedes cambiarte el tope a ti mismo." };
    }

    await updateProfile(id, { monthlyLimitUsd: value });
    await record("persona.limite", target.email || id, { limite: value });

    revalidatePath("/admin");
    return {
      ok: true,
      message: value === null ? "Sin tope de gasto." : `Tope de ${value.toFixed(2)} USD al mes.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo cambiar." };
  }
}

export async function setDisabledAction(
  userId: unknown,
  disabled: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  try {
    const actor = await requireCapability("personas");
    const target = await findProfile(id);
    if (!target) return { ok: false, message: "Esa persona ya no existe." };

    const allowed = canDisable(actor, target);
    if (!allowed.ok) return { ok: false, message: allowed.reason };

    const off = disabled === true;
    await updateProfile(id, { disabled: off });
    await record(off ? "persona.desactivar" : "persona.activar", target.email || id, {});

    revalidatePath("/admin");
    return { ok: true, message: off ? "Cuenta desactivada." : "Cuenta reactivada." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo cambiar." };
  }
}

/* ------------------------- La cuenta de otra persona ------------------------ */

/**
 * Lo que hay que comprobar antes de tocar la cuenta de alguien, en un sitio.
 *
 * Son dos preguntas distintas y las dos hacen falta: `canManageAccount` dice si
 * el papel de quien pide alcanza, y `mandoSobre` si además esa persona está en
 * alguno de sus espacios. Sin la segunda, un administrador podría fijarle la
 * contraseña a alguien de otro equipo — que es el agujero que este trabajo
 * cierra.
 */
async function autorizar(
  id: string,
): Promise<{ ok: true; target: Profile } | { ok: false; message: string }> {
  const actor = await requireCapability("personas");
  const target = await findProfile(id);

  if (!target) return { ok: false, message: "Esa persona ya no existe." };

  const allowed = canManageAccount(actor, target);
  if (!allowed.ok) return { ok: false, message: allowed.reason };

  if (!(await mandoSobre(id))) {
    return { ok: false, message: "Esa persona no está en ninguno de tus espacios." };
  }

  return { ok: true, target };
}

/**
 * Mandarle el enlace para que se ponga la contraseña ella.
 *
 * Es el botón por defecto y no necesita la clave de servicio: es el mismo camino
 * que `/auth/recuperar`, así que quien lo pulsa no llega a saber ninguna
 * contraseña y por tanto no puede entrar como esa persona.
 */
export async function sendRecoveryAction(
  userId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  try {
    const permiso = await autorizar(id);
    if (!permiso.ok) return { ok: false, message: permiso.message };

    const target = permiso.target;
    const supabase = await createClient();

    await supabase.auth.resetPasswordForEmail(target.email, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/auth/nueva-clave`,
    });

    await record("cuenta.recuperacion", target.email || id, {});

    revalidatePath("/admin");
    return { ok: true, message: `Enlace enviado a ${target.email}. Caduca en una hora.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo enviar." };
  }
}

/**
 * Fijarle la contraseña a mano.
 *
 * Es la única llamada de toda la administración de cuentas que usa la clave de
 * servicio, y la única que deja a quien la pulsa **pudiendo entrar en esa
 * cuenta**. Existe para cuando la persona ya no tiene acceso a su buzón, que es
 * cuando el enlace de recuperación no sirve de nada.
 */
export async function setPasswordAction(
  userId: unknown,
  password: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  const clave = typeof password === "string" ? password : "";
  const problema = passwordProblem(clave);
  if (problema) return { ok: false, message: problema };

  try {
    const permiso = await autorizar(id);
    if (!permiso.ok) return { ok: false, message: permiso.message };

    await setPassword(id, clave.trim());

    // Se anota que se cambió, quién y a quién. La contraseña, nunca.
    await record("cuenta.clave", permiso.target.email || id, {});

    revalidatePath("/admin");
    return { ok: true, message: "Contraseña cambiada. Dísela por un canal que no sea el correo." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo cambiar." };
  }
}

/**
 * Proponerle un correo nuevo, que confirma ella.
 *
 * Aquí no cambia nada todavía: la propuesta espera a que la persona entre y la
 * acepte, y es entonces cuando Supabase manda sus dos correos. La vía de
 * administración cambiaría el correo al instante —comprobado— y un correo mal
 * tecleado deja la cuenta apuntando a un buzón ajeno.
 */
export async function proposeEmailAction(
  userId: unknown,
  email: unknown,
): Promise<{ ok: boolean; message: string }> {
  const id = readText(userId);
  if (!id) return { ok: false, message: "Falta la persona." };

  try {
    const permiso = await autorizar(id);
    if (!permiso.ok) return { ok: false, message: permiso.message };

    const target = permiso.target;
    const nuevo = readText(email).toLowerCase();

    const problema = emailProblem(nuevo, target.email);
    if (problema) return { ok: false, message: problema };

    /*
     * Se mira si ya hay alguien con ese correo entre los que se ven.
     *
     * No alcanza a las cuentas de otros espacios —RLS no las deja ver, y está
     * bien que no las deje—, así que este aviso caza el caso corriente y el
     * resto lo caza Supabase al confirmar. Vale la pena igual: es la diferencia
     * entre enterarse ahora y que se entere la otra persona cuando pulse.
     */
    const supabase = await createClient();
    const { data: ocupado } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", nuevo)
      .maybeSingle();

    if (ocupado) return { ok: false, message: "Ya hay una cuenta con ese correo." };

    await proposeEmailChange(id, nuevo);
    await record("cuenta.correo.propuesto", target.email || id, { a: nuevo });

    revalidatePath("/admin");
    return {
      ok: true,
      message: `Propuesto. ${target.email} lo verá al entrar y tendrá que confirmarlo desde su correo.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo proponer." };
  }
}

/** Su propio nombre. Lo puede cambiar cualquiera: no da permiso sobre nada. */
export async function setOwnNameAction(name: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const profile = await requireProfile();
    await updateProfile(profile.id, { name: readText(name).slice(0, 80) });

    revalidatePath("/cuenta");
    return { ok: true, message: "Nombre guardado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}
