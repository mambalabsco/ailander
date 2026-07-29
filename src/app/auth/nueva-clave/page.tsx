import { NewPasswordForm } from "@/app/auth/nueva-clave/new-password-form";

/**
 * Aquí se aterriza desde el enlace del correo.
 *
 * No comprueba la sesión: el enlace ya la abrió al pasar por `/auth/callback`, y
 * si no fuera válida el guardado fallaría con un mensaje que lo explica. Poner
 * aquí otra comprobación solo añadiría una pantalla de error más.
 */
export default function NuevaClavePage() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-2xl font-semibold">Nueva contraseña</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600 dark:text-slate-300">
        Escríbela dos veces. Mínimo 8 caracteres.
      </p>

      <NewPasswordForm />
    </div>
  );
}
