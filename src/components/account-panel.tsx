"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setOwnNameAction } from "@/app/admin/actions";

/** Lo único de su cuenta que uno puede cambiarse: el nombre. */
export function AccountPanel({ name, email }: { name: string; email: string }) {
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm text-slate-500 dark:text-slate-400">{email}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cómo te llamas
          </span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Tu nombre"
            className="w-64 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await setOwnNameAction(value);
              setMessage(result.message);
            })
          }
        >
          {isPending ? "Guardando…" : "Guardar"}
        </Button>

        {message ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
        ) : null}
      </div>

      {/* El papel y el tope no se tocan aquí, y se dice por qué: si no, se busca
          el sitio donde cambiarlos. */}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        El papel y el tope de gasto los cambia un administrador, no tú: son lo que impide que
        cualquiera se dé permisos a sí mismo.
      </p>
    </section>
  );
}
