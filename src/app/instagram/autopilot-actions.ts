"use server";

import { revalidatePath } from "next/cache";
import { resumeAutopilot, saveAutopilot } from "@/lib/data/autopilot";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const entre = (value: unknown, min: number, max: number, porDefecto: number): number => {
  const n = Number(value);

  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : porDefecto;
};

export async function saveAutopilotAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const productId = readText(raw.productId);

  if (!productId) return { ok: false, message: "Falta el producto." };

  const activo = raw.activo === true;
  const igUserId = readText(raw.igUserId);

  /*
   * Encenderlo sin cuenta se rechaza aquí y no en el cron.
   *
   * Un piloto activo sin cuenta se pausaría solo en la primera vuelta, y quien
   * lo encendió se iría convencido de que quedó funcionando. Decirlo al pulsar
   * cuesta una comprobación.
   */
  if (activo && !igUserId) {
    return { ok: false, message: "Elige la cuenta de Instagram antes de encenderlo." };
  }

  const horaDesde = entre(raw.horaDesde, 0, 23, 18);
  const horaHasta = entre(raw.horaHasta, 0, 23, 21);

  try {
    await saveAutopilot(productId, {
      activo,
      igUserId,
      porDia: entre(raw.porDia, 1, 5, 1),
      colchonDias: entre(raw.colchonDias, 1, 14, 3),
      // Al revés no es un error de quien lo puso: es una ventana que cruza la
      // medianoche, y aquí no se admite. Se ordena y se dice en el mensaje.
      horaDesde: Math.min(horaDesde, horaHasta),
      horaHasta: Math.max(horaDesde, horaHasta),
    });

    revalidatePath("/instagram");

    return {
      ok: true,
      message: activo
        ? "Encendido. Publicará solo, y lo que salga no lo va a leer nadie."
        : "Guardado. Está apagado: no publicará nada solo.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function resumeAutopilotAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const productId = readText((input as Record<string, unknown>)?.productId);

  if (!productId) return { ok: false, message: "Falta el producto." };

  try {
    await resumeAutopilot(productId);
    revalidatePath("/instagram");

    return { ok: true, message: "Reanudado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
