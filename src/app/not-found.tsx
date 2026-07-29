import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <p className="text-4xl font-semibold text-violet-600">404</p>
      <h2 className="mt-3 text-lg font-semibold">No hemos encontrado esta página</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Es posible que el producto se haya eliminado o que el enlace ya no sea válido.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
        >
          Ir al dashboard
        </Link>
        <Link
          href="/products"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Ver productos
        </Link>
      </div>
    </div>
  );
}
