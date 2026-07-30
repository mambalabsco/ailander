import Link from "next/link";
import { DatosNav } from "@/components/datos/datos-nav";

/**
 * Chasis de Datos y beneficio.
 *
 * Los controles de tienda y rango **no** están aquí, están en cada página. Un
 * layout de Next no recibe `searchParams`, y ahí vive todo el estado del
 * informe: ponerlos en el layout obligaría a leerlos solo desde el navegador y
 * la primera pintada saldría con el rango equivocado.
 *
 * Lo que sí vive aquí es la navegación, que es lo único común de verdad.
 */
export default function DatosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Datos y beneficio</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Lo que entró en Shopify menos lo que costó traerlo y servirlo.
            </p>
          </div>

          <Link
            href="/datos/conexiones"
            className="text-sm font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
          >
            Conexiones y cuentas
          </Link>
        </div>
      </header>

      <DatosNav />

      {children}
    </div>
  );
}
