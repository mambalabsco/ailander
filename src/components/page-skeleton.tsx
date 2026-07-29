/**
 * Esqueleto de carga compartido.
 *
 * Se monta solo en segmentos que nunca llaman a `notFound()`. Un `loading.tsx`
 * abre un límite de Suspense y la respuesta empieza a transmitirse con 200,
 * lo que impediría que rutas como `/products/[id]` devolvieran un 404 real.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando...</span>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-6 w-56 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800/60" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
