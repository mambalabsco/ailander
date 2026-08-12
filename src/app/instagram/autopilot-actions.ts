"use server";

import { revalidatePath } from "next/cache";
import { resumeAutopilot, saveAutopilot } from "@/lib/data/autopilot";
import { findProductAnywhere } from "@/lib/products";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const entre = (value: unknown, min: number, max: number, porDefecto: number): number => {
  const n = Number(value);

  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : porDefecto;
};

/**
 * La zona horaria, comprobada contra `Intl` y no contra una lista escrita aquí.
 *
 * Una lista propia se queda vieja —los nombres de la base de datos de zonas
 * cambian— y un valor inventado no falla al guardarlo: falla mucho después, al
 * programar, y entonces el producto se queda sin vuelta. Preguntando a `Intl`,
 * lo que se guarda es lo mismo que va a saber interpretar quien programe.
 */
const zonaValida = (value: unknown): string => {
  const zona = readText(value);

  if (!zona) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });

    return zona;
  } catch {
    return "UTC";
  }
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
    /*
     * `product_id` es la clave primaria global de `instagram_autopilot`, y esta
     * acción es un endpoint público: cualquiera puede mandar el id de un
     * producto ajeno. El `upsert` de `saveAutopilot` no lo filtra —el
     * disparador rellena `workspace_id` con el de quien llama, así que la
     * política de inserción siempre deja pasar— y si esa fila ya existía de
     * otro espacio, quedaría ocupada para siempre: el dueño legítimo caería en
     * `ON CONFLICT DO UPDATE`, que su política de actualización sí rechaza.
     *
     * Por eso se lee primero por la capa de sesión: RLS acota a lo del espacio
     * de quien llama, así que si no aparece, da igual que no exista o que sea
     * de otro — no se distingue, para no dar pistas.
     */
    const product = await findProductAnywhere(productId);
    if (!product) return { ok: false, message: "Ese producto no existe." };

    await saveAutopilot(productId, {
      activo,
      igUserId,
      porDia: entre(raw.porDia, 1, 5, 1),
      colchonDias: entre(raw.colchonDias, 1, 14, 3),
      // Al revés no es un error de quien lo puso: es una ventana que cruza la
      // medianoche, y aquí no se admite. Se ordena en silencio.
      horaDesde: Math.min(horaDesde, horaHasta),
      horaHasta: Math.max(horaDesde, horaHasta),
      zonaHoraria: zonaValida(raw.zonaHoraria),
    });

    revalidatePath("/instagram");

    return {
      ok: true,
      // Y se dice que la pausa se levanta: guardar sin decirlo dejaría a quien
      // lo pausó a mano creyendo que sigue parado.
      message: activo
        ? "Encendido, y sin pausa. Publicará solo, y lo que salga no lo va a leer nadie."
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
