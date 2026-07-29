import Link from "next/link";
import { ResetForm } from "@/app/auth/recuperar/reset-form";

export default function RecuperarPage() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-2xl font-semibold">Recuperar la contraseña</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600 dark:text-slate-300">
        Te mandamos un enlace para poner una nueva. Caduca en una hora.
      </p>

      <ResetForm />

      <p className="mt-6 text-sm">
        <Link href="/auth/login" className="text-violet-600 hover:underline dark:text-violet-300">
          Volver a entrar
        </Link>
      </p>
    </div>
  );
}
