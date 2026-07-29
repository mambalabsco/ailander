"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Field, TextField } from "@/components/ui";

interface AuthFormProps {
  mode: "login" | "signup";
  action: (
    prev: { error?: string } | null,
    formData: FormData,
  ) => Promise<{ error?: string }>;
  /** A dónde volver después de entrar. */
  next?: string;
  /** Aviso al llegar recién registrado. */
  notice?: string | null;
}

const COPY = {
  login: {
    title: "Entrar",
    subtitle: "Accede a tus productos, tu investigación y tus campañas.",
    submit: "Entrar",
    pending: "Entrando...",
    switchText: "¿Todavía no tienes cuenta?",
    switchHref: "/auth/signup",
    switchLabel: "Crear una",
  },
  signup: {
    title: "Crear cuenta",
    subtitle: "Cada cuenta tiene sus propios productos, y nadie más puede verlos.",
    submit: "Crear cuenta",
    pending: "Creando...",
    switchText: "¿Ya tienes cuenta?",
    switchHref: "/auth/login",
    switchLabel: "Entrar",
  },
} as const;

export function AuthForm({ mode, action, next, notice }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const copy = COPY[mode];

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-lg font-semibold text-white">
          LL
        </div>
        <div>
          <p className="font-semibold">Lumen Lab</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Marketing IA</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>

        {notice ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {notice}
          </p>
        ) : null}

        <form action={formAction} className="mt-5 space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}

          {mode === "signup" ? (
            <Field label="Nombre">
              <TextField name="displayName" autoComplete="name" placeholder="Cómo quieres que te llamemos" />
            </Field>
          ) : null}

          <Field label="Correo">
            <TextField
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="tu@correo.com"
            />
          </Field>

          <Field label="Contraseña">
            <TextField
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Mínimo 8 caracteres"
            />
          </Field>

          {state?.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={isPending} className="w-full justify-center">
            {isPending ? copy.pending : copy.submit}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
          {copy.switchText}{" "}
          <Link href={copy.switchHref} className="font-medium text-violet-600 hover:underline">
            {copy.switchLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
