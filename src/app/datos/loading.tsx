/**
 * Esqueleto de las pantallas de Datos.
 *
 * Hacía falta más aquí que en ningún otro sitio: cada pestaña lanza cuatro o
 * cinco consultas —pedidos, líneas, gasto, costos, cuentas— y con un mes de
 * datos eso tarda lo suficiente como para que un clic parezca no haber hecho
 * nada. Sin esto se pulsa dos veces.
 *
 * La forma imita la de las pantallas reales —controles, tarjetas de indicadores,
 * tabla— para que el salto al contenido no mueva nada de sitio. Un esqueleto con
 * otra silueta produce un reajuste que se nota más que no tener esqueleto.
 */
export default function DatosLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando los datos…</span>

      {/* Controles: tienda, periodo, sincronizar. */}
      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-14 w-52 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-14 w-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="ml-auto h-10 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Indicadores. El primero es el doble de ancho, como el beneficio neto. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className={`rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${
              item === 0 ? "sm:col-span-2" : ""
            }`}
          >
            <div className="h-4 w-28 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800/60" />
            <div
              className={`mt-3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800 ${
                item === 0 ? "h-10 w-52" : "h-8 w-32"
              }`}
            />
            <div className="mt-3 h-4 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800/60" />
            <div className="mt-3 h-8 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>

      {/* Tabla o gráfico. */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-5 w-48 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-8 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
