import { DatosHeader } from "@/app/datos/header";
import { GrainPicker } from "@/components/datos/grain-picker";
import { money } from "@/components/datos/metrics";
import { bucketRows, grainFrom, loadReport, reportContext } from "@/app/datos/report";
import { sumRows, type Totals } from "@/lib/profit";
import { daysIn } from "@/lib/date-range";
import { lastSyncedOrderDate } from "@/lib/data/analytics";

/**
 * Pérdidas y ganancias, línea a línea.
 *
 * Es la pestaña que hay que poder cuadrar contra el banco, así que enseña las
 * piezas y no los derivados: ventas brutas, descuentos, devoluciones, impuestos
 * y envío por separado, y solo después su suma.
 *
 * **Las columnas van de la más reciente a la más antigua**, de izquierda a
 * derecha, y la última es el total. Es al revés de lo que haría un eje de tiempo,
 * y es correcto aquí: lo que se mira primero al abrir esta tabla es la semana en
 * curso, no la de hace tres meses.
 */

interface PageProps {
  searchParams: Promise<{
    tienda?: string;
    rango?: string;
    desde?: string;
    hasta?: string;
    grano?: string;
  }>;
}

/** Las filas del informe, en el orden en que se leen. */
interface Line {
  label: string;
  read: (totals: Totals) => number;
  /** Un coste se escribe entre paréntesis, como en cualquier informe contable. */
  cost?: boolean;
  emphasis?: boolean;
  indent?: boolean;
}

const LINES: Line[] = [
  { label: "Ventas brutas", read: (t) => t.grossSales },
  { label: "Descuentos", read: (t) => t.discounts, cost: true },
  { label: "Devoluciones", read: (t) => t.returns, cost: true },
  { label: "Impuestos cobrados", read: (t) => t.taxes },
  { label: "Envío cobrado", read: (t) => t.shippingCharged },
  { label: "Ingresos", read: (t) => t.revenue, emphasis: true },

  { label: "Mercancía", read: (t) => t.cogs, cost: true },
  { label: "Envío", read: (t) => t.shippingCost, cost: true },
  { label: "Comisiones de pasarela", read: (t) => t.transactionFees, cost: true },
  { label: "Beneficio bruto", read: (t) => t.grossProfit, emphasis: true },

  { label: "Publicidad", read: (t) => t.adSpend, cost: true },
  {
    label: "Meta",
    read: (t) => t.adSpendByProvider.facebook ?? 0,
    cost: true,
    indent: true,
  },
  {
    label: "Google",
    read: (t) => t.adSpendByProvider.google ?? 0,
    cost: true,
    indent: true,
  },
  { label: "Costos propios", read: (t) => t.customCosts, cost: true },
  { label: "Costos totales", read: (t) => t.totalCosts, cost: true, emphasis: true },

  { label: "Beneficio neto", read: (t) => t.netProfit, emphasis: true },
  { label: "Propinas", read: (t) => t.tips },
];

export default async function PygPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, range, comparison } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [report, lastOrder] = await Promise.all([
    loadReport(store.id, range, comparison, { currency, timeZone: context.timeZone }),
    lastSyncedOrderDate(store.id),
  ]);

  const grain = grainFrom(params.grano, daysIn(range));
  // De la más reciente a la más antigua, que es el orden en que se lee.
  const buckets = bucketRows(report.rows, grain).reverse();
  const columns = buckets.map((bucket) => ({
    label: bucket.label,
    totals: sumRows(bucket.rows),
  }));

  const total = report.totals;

  const cell = (line: Line, totals: Totals) => {
    const value = line.read(totals);
    if (value === 0) return <span className="text-slate-400 dark:text-slate-600">—</span>;

    const text = money(Math.abs(value), currency);
    // Un negativo en una línea que ya es un coste no se escribe con dos signos.
    if (line.cost) return `(${text})`;
    return value < 0 ? `(${text})` : text;
  };

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GrainPicker grain={grain} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Importes en {currency}. Los costos van entre paréntesis.
        </p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-medium dark:bg-slate-900">
                {/* Vacío: la primera columna son los nombres de las líneas. */}
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-500 dark:text-slate-400"
                >
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Total</th>
            </tr>
          </thead>

          <tbody>
            {LINES.map((line) => (
              <tr
                key={line.label}
                className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                  line.emphasis ? "bg-slate-50 font-semibold dark:bg-slate-800/40" : ""
                }`}
              >
                <td
                  className={`sticky left-0 z-10 px-4 py-2 whitespace-nowrap ${
                    line.emphasis
                      ? "bg-slate-50 dark:bg-slate-800/40"
                      : "bg-white dark:bg-slate-900"
                  } ${line.indent ? "pl-10 text-slate-500 dark:text-slate-400" : ""}`}
                >
                  {line.label}
                </td>

                {columns.map((column) => (
                  <td
                    key={column.label}
                    className="px-4 py-2 text-right tabular-nums whitespace-nowrap"
                  >
                    {cell(line, column.totals)}
                  </td>
                ))}

                <td className="px-4 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                  {cell(line, total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Los ingresos incluyen los impuestos cobrados y el envío cobrado, porque son dinero que entró
        en la cuenta. Si los declaras aparte, réstalos de su propia línea.
      </p>
    </div>
  );
}
