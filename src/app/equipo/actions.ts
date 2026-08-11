"use server";

import { revalidatePath } from "next/cache";
import {
  addMemberByEmail,
  removeMember,
  setExclusion,
  setRole,
} from "@/lib/data/workspace";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function addMemberAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const workspaceId = readText(raw.workspaceId);
  const email = readText(raw.email);
  const role = readText(raw.role) || "editor";

  if (!workspaceId || !email) return { ok: false, message: "Falta el correo." };

  try {
    const result = await addMemberByEmail(workspaceId, email, role);
    revalidatePath("/equipo");

    return result;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function setRoleAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await setRole(readText(raw.workspaceId), readText(raw.userId), readText(raw.role));
    revalidatePath("/equipo");

    return { ok: true, message: "Papel cambiado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function removeMemberAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await removeMember(readText(raw.workspaceId), readText(raw.userId));
    revalidatePath("/equipo");

    /*
     * Se dice que los datos se quedan.
     *
     * Ya son del espacio, no suyos. Quien saca a alguien de un equipo suele
     * esperar lo contrario —que se lleve lo suyo— y descubrirlo después es una
     * sorpresa mala en las dos direcciones.
     */
    return { ok: true, message: "Fuera del equipo. Lo que creó se queda en el espacio." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function setExclusionAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await setExclusion({
      workspaceId: readText(raw.workspaceId),
      productId: readText(raw.productId),
      userId: readText(raw.userId),
      excluded: raw.excluded === true,
      reason: readText(raw.reason),
    });

    revalidatePath("/equipo");

    return { ok: true, message: raw.excluded === true ? "Sacado del producto." : "Devuelto." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
