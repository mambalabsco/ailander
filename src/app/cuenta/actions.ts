"use server";

import { revalidatePath } from "next/cache";
import { dropEmailChange, myPendingEmailChange } from "@/lib/data/email-changes";
import { record, requireProfile } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Lo que una persona hace con su propia cuenta.
 *
 * Va aparte de `/admin/actions.ts` porque la frontera es justo esa: allí se toca
 * la cuenta de otro y hay que comprobar el mando; aquí se toca la propia y lo
 * que protege es la sesión. Juntas, algún día se copia una comprobación de una a
 * otra donde no vale — y el día que pase, no dará ningún error.
 */

/**
 * Aceptar el correo que propuso un administrador.
 *
 * Quien llama a `updateUser` es esta persona con **su** sesión, y por eso
 * Supabase manda su correo al buzón viejo y al nuevo: es un cambio de correo
 * normal, no una operación de administración. Comprobado el 12 de agosto de 2026
 * que la vía de administración se salta esos dos correos.
 */
export async function confirmEmailChangeAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const yo = await requireProfile();
    const propuesta = await myPendingEmailChange();

    if (!propuesta) return { ok: false, message: "No hay ningún correo propuesto." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ email: propuesta.nuevoEmail });

    if (error) {
      /*
       * El caso corriente es que ese correo ya tenga cuenta, y el mensaje de
       * Supabase viene en inglés. Se traduce el que se conoce y se deja pasar el
       * resto tal cual, que es lo que hace útil un mensaje raro.
       */
      const yaExiste = /already|registered|exists/i.test(error.message);

      return { ok: false, message: yaExiste ? "Ya hay una cuenta con ese correo." : error.message };
    }

    /*
     * La propuesta se borra ya, y eso **no** significa que el correo sea el
     * nuevo: significa que esta persona dijo que sí. Lo que queda —pulsar los
     * dos enlaces— es de Supabase. Mantenerla hasta verlo cambiado dejaría el
     * aviso pegado en la pantalla de quien decida no pulsar.
     */
    await dropEmailChange(yo.id);
    await record("cuenta.correo.confirmado", yo.email, { a: propuesta.nuevoEmail });

    revalidatePath("/cuenta");
    return {
      ok: true,
      message: "Mira tu correo: hay que pulsar el enlace en el buzón viejo y en el nuevo.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function rejectEmailChangeAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const yo = await requireProfile();
    const propuesta = await myPendingEmailChange();

    if (!propuesta) return { ok: false, message: "No hay ningún correo propuesto." };

    await dropEmailChange(yo.id);
    await record("cuenta.correo.rechazado", yo.email, { era: propuesta.nuevoEmail });

    revalidatePath("/cuenta");
    return { ok: true, message: "Descartado. Tu correo se queda como está." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
