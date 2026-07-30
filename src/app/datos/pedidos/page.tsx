import { DatosHeader } from "@/app/datos/header";
import { money, pct } from "@/components/datos/metrics";
import { loadReport, reportContext } from "@/app/datos/report";
import { orderBreakdown } from "@/lib/profit";
import { lastSyncedOrderDate, readOrdersForRange } from "@/lib/data/analytics";

/**
 * Pedido a pedido, con su margen.
 *
 * Es la pestaña de depuración del panel: cuando un total no cuadra, la fila que
 * dice «margen del 98%» es la que tiene la variante sin coste de mercancía. Por
 * eso cada fila incompleta se marca, en vez de contarlas solo en el agregado —un
 * aviso que dice «tres variantes sin coste» no dice *cuáles*.
 *
 * Aquí se enseña beneficio **bruto**, no neto. Un sueldo o la cuota de Shopify no
 * pertenecen a un pedido concreto, y repartirlos entre ellos inventaría una
 * atribución que no existe.
 */

interface PageProps {
  searchParams: Promise<{
    tienda?: string;
    rango?: string;
    desde?: string;
    hasta?: string;
    orden?: string;
  }>;
}

export default async function PedidosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, range, comparison } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [report, orders, lastOrder] = await Promise.all([
    loadReport(store.id, range, comparison, { currency, timeZone: context.timeZone }),
    readOrdersForRange(store.id, range.from, range.to),
    lastSyncedOrderDate(store.id),
  ]);

  const rows = orders
    .filter((order) => !order.test)
    .map((order) => orderBreakdown(order, report.settings))
    // Del más reciente al más antiguo: es el que se quiere mirar al abrir.
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt));

  const totals = rows.reduce(
    (sum, row) => ({
      units: sum.units + row.units,
      revenue: sum.revenue + row.revenue,
      cogs: sum.cogs + row.cogs,
      shippingCost: sum.shippingCost + row.shippingCost,
      transactionFees: sum.transactionFees + row.transactionFees,
      grossProfit: sum.grossProfit + row.grossProfit,
    }),
    { units: 0, revenue: 0, cogs: 0, shippingCost: 0, transactionFees: 0, grossProfit: 0 },
  );

  const incomplete = rows.filter((row) => row.incomplete).length;

  const dateFormat = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: context.timeZone,
  });

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">{rows.length}</span> pedido(s) ·{" "}
          {totals.units.toLocaleString("es-ES")} unidades
          {incomplete > 0 ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {incomplete} con costos a medias
            </span>
          ) : null}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Importes en {currency} · horas en {context.timeZone}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No hay pedidos guardados en este periodo.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 text-left font-medium">Pedido</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Fecha
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Uds.
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Ingresos
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Mercancía
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Envío
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Comisión
                </th>
                <th className="px-4 py-3 text-right font-medium">Bruto</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Margen
                </th>
              </tr>
            </thead>

            <tbody>
              {/* El total va arriba: es lo que se busca al abrir la tabla, y al
                  final de doscientas filas haría falta bajar hasta el fondo. */}
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold dark:border-slate-800 dark:bg-slate-800/40">
                <td className="px-4 py-3">Total de {rows.length}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{totals.units}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(totals.revenue, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ({money(totals.cogs, currency)})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ({money(totals.shippingCost, currency)})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ({money(totals.transactionFees, currency)})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(totals.grossProfit, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {pct(totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : null)}
                </td>
              </tr>

              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {row.name}
                    {row.incomplete ? (
                      <span
                        title="A este pedido le falta algún coste, así que su margen sale más alto del real"
                        className="ml-2 text-amber-600 dark:text-amber-400"
                        aria-label="costos incompletos"
                      >
                        ⚠
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {dateFormat.format(new Date(row.processedAt))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.units}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {money(row.revenue, currency)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {row.cogs === 0 ? "—" : `(${money(row.cogs, currency)})`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {row.shippingCost === 0 ? "—" : `(${money(row.shippingCost, currency)})`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {row.transactionFees === 0 ? "—" : `(${money(row.transactionFees, currency)})`}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium tabular-nums ${
                      row.grossProfit < 0 ? "text-rose-600 dark:text-rose-400" : ""
                    }`}
                  >
                    {money(row.grossProfit, currency)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {pct(row.grossMargin, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
