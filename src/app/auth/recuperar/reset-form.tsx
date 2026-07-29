"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/auth/actions";
import { Button, Field, TextField } from "@/components/ui";

export function ResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  /*
   * El mensaje de éxito no confirma que la cuenta exista.
   *
   * «Si ese correo está registrado…» es lo que impide usar este formulario para
   * averiguar qué cuentas hay dadas de alta.
   */
  if (state?.sent) {
    return (
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        Si ese correo está registrado, te acabamos de mandar el enlace. Revisa también la carpeta de
        no deseado.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Tu correo">
        <TextField type="email" name="email" required autoComplete="email" />
      </Field>

      {state?.error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Enviando..." : "Mandarme el enlace"}
      </Button>
    </form>
  );
}
