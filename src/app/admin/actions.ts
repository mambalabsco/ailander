"use server";

import { revalidatePath } from "next/cache";
import { canAssign, canDisable, isRole, type Role } from "@/lib/roles";
import { record, requireCapability, requireProfile } from "@/lib/permissions";
import { findProfile, updateProfile } from "@/lib/data/profiles";

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
