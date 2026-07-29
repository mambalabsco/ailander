"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/auth/actions";
import { Button, Field, TextField } from "@/components/ui";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null);

  return (
    <form action={action} className="space-y-4">
      <Field label="Nueva contraseña">
        <TextField type="password" name="password" required autoComplete="new-password" />
      </Field>
      <Field label="Repítela">
        <TextField type="password" name="repeat" required autoComplete="new-password" />
      </Field>

      {state?.error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Guardando..." : "Guardar y entrar"}
      </Button>
    </form>
  );
}
