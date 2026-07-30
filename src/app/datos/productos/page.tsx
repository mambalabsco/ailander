import Link from "next/link";
import { DatosHeader } from "@/app/datos/header";
import { DataWarning, money, pct } from "@/components/datos/metrics";
import { loadReport, reportContext } from "@/app/datos/report";
import { cogsForLine } from "@/lib/profit";
import { lastSyncedOrderDate, readOrdersForRange } from "@/lib/data/analytics";

/**
 * Qué producto deja dinero.
 *
 * Se agrupa por **variante** y no por producto porque es justo ahí donde está la
 * decisión: el bote suelto y el pack de tres tienen precios y costes distintos, y
 * saber cuál de los dos deja margen es lo que cambia la oferta.
 *
 * El envío y la comisión **no** se reparten entre variantes. Un pedido con tres
 * productos distintos paga un solo envío, y repartirlo —por unidades, por
 * importe, como sea— inventaría una atribución que no existe. Por eso aquí se
 * enseña «ingresos menos mercancía» y se dice que es eso.
 */

interface PageProps {
  searchParams: Promise<{ tienda?: string; rango?: string; desde?: string; hasta?: string }>;
}

interface Row {
  key: string;
  title: string;
  sku: string;
  units: number;
  refunded: number;
  revenue: number;
  cogs: number;
  hasCogs: boolean;
}

export default async function ProductosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, range, comparison } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [report, orders, lastOrder] = await Promise.all([
    loadReport(store.id, range, comparison, { currency, timeZone: context.timeZone }),
    readOrdersForRange(store.id, range.from, range.to),
    lastSyncedOrderDate(store.id),
  ]);

  const grouped = new Map<string, Row>();

  for (const order of orders) {
    if (order.test) continue;

    for (const line of order.lines) {
      const key = line.variantRef || line.productRef || line.title;
      const units = Math.max(0, line.quantity - line.refundedQuantity);
      const lineCogs = cogsForLine(report.settings.cogs, line);

      const current =
        grouped.get(key) ??
        ({
          key,
          title: line.title,
          sku: line.sku,
          units: 0,
          refunded: 0,
          revenue: 0,
          cogs: 0,
          hasCogs: false,
        } satisfies Row);

      current.units += units;
      current.refunded += line.refundedQuantity;
      /*
       * Ingresos de la línea: precio de tarifa menos su parte del descuento.
       * Es lo que Shopify asigna a esta línea, así que las líneas de un pedido
       * suman su subtotal sin que haya que repartir nada a mano.
       */
      current.revenue += line.unitPrice * units - line.discount;
      current.cogs += lineCogs;
      if (lineCogs > 0) current.hasCogs = true;

      grouped.set(key, current);
    }
  }

  const rows = [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
  const missing = rows.filter((row) => !row.hasCogs && row.units > 0);

  const totals = rows.reduce(
    (sum, row) => ({
      units: sum.units + row.units,
      revenue: sum.revenue + row.revenue,
      cogs: sum.cogs + row.cogs,
    }),
    { units: 0, revenue: 0, cogs: 0 },
  );

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      {missing.length > 0 ? (
        <DataWarning title={`${missing.length} variante(s) sin coste de mercancía`}>
          Su margen sale al 100%, que no es real.{" "}
          <Link
            href={`/datos/costos?tienda=${store.id}`}
            className="font-medium underline underline-offset-4"
          >
            Poner los costes
          </Link>
        </DataWarning>
      ) : null}

      <p className="text-sm text-slate-500 dark:text-slate-400">
        El margen de esta tabla es ingresos menos mercancía. El envío y las comisiones no se reparten
        entre variantes porque un pedido con varios productos paga un solo envío.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No hay ventas en este periodo.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 text-left font-medium">Variante</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Unidades
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Devueltas
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Ingresos
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Mercancía
                </th>
                <th className="px-4 py-3 text-right font-medium">Margen</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  %
                </th>
              </tr>
            </thead>

            <tbody>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold dark:border-slate-800 dark:bg-slate-800/40">
                <td className="px-4 py-3">Total de {rows.length} variante(s)</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.units}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(totals.revenue, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ({money(totals.cogs, currency)})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(totals.revenue - totals.cogs, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {pct(
                    totals.revenue > 0
                      ? ((totals.revenue - totals.cogs) / totals.revenue) * 100
                      : null,
                    0,
                  )}
                </td>
              </tr>

              {rows.map((row) => {
                const margin = row.revenue - row.cogs;

                return (
                  <tr
                    key={row.key}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-4 py-2">
                      <p className="font-medium">{row.title}</p>
                      {row.sku ? (
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {row.sku}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.units}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {row.refunded === 0 ? "—" : row.refunded}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(row.revenue, currency)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {row.hasCogs ? (
                        `(${money(row.cogs, currency)})`
                      ) : (
                        <span
                          className="text-amber-600 dark:text-amber-400"
                          title="Sin coste de mercancía puesto"
                        >
                          sin poner
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {money(margin, currency)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {pct(row.revenue > 0 ? (margin / row.revenue) * 100 : null, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
