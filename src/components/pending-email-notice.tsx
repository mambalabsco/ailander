"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { confirmEmailChangeAction, rejectEmailChangeAction } from "@/app/cuenta/actions";

/**
 * El aviso de que alguien propuso cambiarte el correo.
 *
 * Va arriba del todo y con las dos salidas a la vista. Un cambio de correo que
 * no se pidió es la primera señal de que alguien está intentando quedarse con la
 * cuenta: enterrarlo debajo del gasto del mes sería el sitio exacto donde no hay
 * que ponerlo.
 */
export function PendingEmailNotice({ nuevoEmail }: { nuevoEmail: string }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        Un administrador de tu equipo propone cambiar tu correo a <strong>{nuevoEmail}</strong>.
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
        Si aceptas, te llegarán dos correos —al de siempre y al nuevo— y el cambio no será real
        hasta que pulses los dos enlaces. Si no lo has pedido tú, descártalo.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmEmailChangeAction();
              setMessage(result.message);
            })
          }
        >
          Aceptar y recibir los correos
        </Button>
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await rejectEmailChangeAction();
              setMessage(result.message);
            })
          }
        >
          Descartar
        </Button>
      </div>

      {message ? <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">{message}</p> : null}
    </div>
  );
}
