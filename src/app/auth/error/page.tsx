import Link from "next/link";

export const metadata = { title: "Error de acceso | Lumen Lab IA" };

const REASONS: Record<string, string> = {
  "sin-codigo": "El enlace no traía código de confirmación. Puede que esté incompleto.",
  canje: "El enlace ya se había usado o ha caducado. Pide uno nuevo desde la pantalla de entrada.",
};

interface AuthErrorPageProps {
  searchParams: Promise<{ motivo?: string }>;
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { motivo } = await searchParams;

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-xl font-semibold">No se pudo completar el acceso</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {REASONS[motivo ?? ""] ?? "Algo falló al validar el enlace."}
      </p>
      <Link
        href="/auth/login"
        className="mt-5 inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
      >
        Volver a entrar
      </Link>
    </div>
  );
}
