import { ReportControls } from "@/components/datos/report-controls";
import { DataWarning } from "@/components/datos/metrics";
import { describeRange } from "@/lib/date-range";
import type { ReportContext } from "@/app/datos/report";

/**
 * Cabecera común de las pestañas de Datos.
 *
 * Cada página la pinta con su propio contexto en vez de heredarla del layout,
 * porque el contexto sale de `searchParams` y un layout no los recibe.
 *
 * Aquí viven también los dos avisos que impiden leer un informe equivocado sin
 * saberlo: la tienda sin conectar y la tienda sin sincronizar. Los dos producen
 * un informe **vacío pero creíble** —«no hubo ventas»— y sin el aviso es
 * imposible distinguirlo de que de verdad no hubiera ventas.
 */
export function DatosHeader({
  context,
  synced,
}: {
  context: ReportContext;
  /** Si hay algún pedido guardado de esta tienda. */
  synced: boolean;
}) {
  const { stores, store, range, comparison, preset, currency, timeZone } = context;

  return (
    <div className="space-y-4">
      <ReportControls
        stores={stores.map((item) => ({
          id: item.id,
          name: item.name,
          connected: Boolean(item.shopifyAdminToken && item.shopifyShopDomain),
        }))}
        currency={currency}
        timeZone={timeZone}
        preset={preset}
        range={range}
        syncedRange={range}
      />

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {describeRange(range)}
        <span className="text-slate-400 dark:text-slate-500">
          {" · comparado con "}
          {describeRange(comparison)}
        </span>
      </p>

      {stores.length === 0 ? (
        <DataWarning title="No hay ninguna tienda todavía">
          Crea una en Tiendas y mercados y conéctala a Shopify.
        </DataWarning>
      ) : !store?.shopifyAdminToken || !store.shopifyShopDomain ? (
        <DataWarning title={`«${store?.name}» no está conectada a Shopify`}>
          Sin conexión no hay pedidos que leer. Conéctala en Tiendas y mercados.
        </DataWarning>
      ) : !synced ? (
        <DataWarning title="Esta tienda todavía no se ha sincronizado">
          Las cifras están a cero porque no hay pedidos guardados, no porque no hubiera ventas.
          Pulsa «Sincronizar» para traer el periodo que estás mirando.
        </DataWarning>
      ) : !store.shopCurrency ? (
        <DataWarning title="No se sabe en qué moneda liquida esta tienda">
          Los importes se están enseñando en {currency} por defecto. La próxima sincronización lo
          resuelve preguntándoselo a Shopify.
        </DataWarning>
      ) : null}
    </div>
  );
}
