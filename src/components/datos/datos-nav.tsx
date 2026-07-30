"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Pestañas de Datos.
 *
 * **Arrastra los parámetros de la URL al cambiar de pestaña.** Sin esto, pasar
 * del panel a pérdidas y ganancias perdería la tienda y el rango elegidos y
 * habría que volver a ponerlos en cada pestaña — que es exactamente lo que hace
 * inútil un panel con seis vistas.
 */

const TABS = [
  { href: "/datos", label: "Panel" },
  { href: "/datos/campanas", label: "Campañas" },
  { href: "/datos/pyg", label: "Pérdidas y ganancias" },
  { href: "/datos/pedidos", label: "Pedidos" },
  { href: "/datos/atribucion", label: "Atribución" },
  { href: "/datos/productos", label: "Productos" },
  { href: "/datos/costos", label: "Costos" },
];

export function DatosNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
      {TABS.map((tab) => {
        // Coincidencia exacta: `startsWith` haría que «Panel» —que vive en
        // `/datos`— saliera activo en todas las pestañas a la vez.
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={query ? `${tab.href}?${query}` : tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
