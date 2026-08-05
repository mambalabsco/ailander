import Link from "next/link";
import { DataWarning, MetricCard, money, pct, times } from "@/components/datos/metrics";
import { DatosNav } from "@/components/datos/datos-nav";
import { loadReport } from "@/app/datos/report";
import { listStores } from "@/lib/store-registry";
import { previousRange, describeRange, isPreset, resolveRange, todayIn } from "@/lib/date-range";
import { ensureRates } from "@/lib/data/fx-rates";
import { code, convert, type Rate } from "@/lib/fx";
import type { RangePreset } from "@/lib/date-range";

/**
 * Todas las tiendas juntas.
 *
 * ## Por qué es una página aparte y no un «Todas» en el selector
 *
 * Porque no es el mismo informe con otro filtro. Cada tienda tiene **su moneda
 * y su zona horaria**: sumar pesos chilenos con pesos mexicanos y con dólares da
 * un número que existe y no significa nada, y «hoy» empieza a horas distintas en
 * cada una. Un selector con «Todas» dentro escondería las dos cosas.
 *
 * Aquí se dice en pantalla: en qué moneda está la suma, qué se convirtió y qué
 * no se pudo convertir. Una tienda que no se puede convertir **no se suma** y se
 * enseña aparte — meterla al cambio de otro día, o sin convertir, daría un total
 * creíble y equivocado, que es la peor clase de error de este panel.
 *
 * ## Y por qué no reutiliza `reportContext`
 *
 * Porque ese resuelve *una* tienda y su moneda. Aquí la moneda no sale de la
 * tienda: se elige, y por defecto es la de la primera, que es la que más se
 * mira.
 */

interface PageProps {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string; moneda?: string }>;
}

export default async function TodasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const stores = await listStores();

  if (stores.length === 0) {
    return (
      <div className="space-y-6">
        <DatosNav />
        <DataWarning title="No hay ninguna tienda todavía">
          Crea una en Tiendas y mercados y conéctala a Shopify.
        </DataWarning>
      </div>
    );
  }

  /*
   * La moneda del total: la que se pida, o la de la primera tienda.
   *
   * No se elige «la más repetida» ni se fuerza el dólar. La primera es la que se
   * abre siempre, y ver el total en la moneda con la que se piensa el negocio es
   * lo que hace que el número se entienda sin traducirlo mentalmente.
   */
  const target = code(params.moneda) || code(stores[0].shopCurrency) || "USD";

  /*
   * El día se calcula en la zona de la primera tienda.
   *
   * Da igual cuál se elija: lo que no se puede es calcular uno por tienda y
   * llamarlo «el mismo rango». Se dice en pantalla de qué zona sale.
   */
  const timeZone = stores[0].shopTimeZone || "UTC";
  const today = todayIn(timeZone);

  const preset: RangePreset = isPreset(params.rango) ? params.rango : "hoy";
  const range = resolveRange(preset, today, { from: params.desde, to: params.hasta });
  const comparison = previousRange(range, preset);

  const reports = await Promise.all(
    stores.map(async (store) => ({
      store,
      report: await loadReport(store.id, range, comparison, {
        currency: store.shopCurrency || "USD",
        timeZone: store.shopTimeZone || "UTC",
      }).catch(() => null),
    })),
  );

  /*
   * Los cambios de moneda, en una sola tanda.
   *
   * Se piden todos los pares del último día del rango: uno por tienda con moneda
   * distinta. Pedirlos dentro del bucle serían N llamadas y N esperas por un
   * dato que se comparte.
   */
  const pairs = reports
    .map(({ store }) => ({ day: range.to, from: code(store.shopCurrency), to: target }))
    .filter((pair) => pair.from && pair.from !== pair.to);

  const rates: Rate[] = pairs.length > 0 ? await ensureRates(pairs).catch(() => []) : [];

  let revenue = 0;
  let spend = 0;
  let profit = 0;
  let orders = 0;

  const rows: {
    name: string;
    id: string;
    currency: string;
    revenue: number | null;
    profit: number | null;
    problem: string;
  }[] = [];

  for (const { store, report } of reports) {
    const currency = code(store.shopCurrency) || "USD";

    if (!report) {
      rows.push({
        name: store.name,
        id: store.id,
        currency,
        revenue: null,
        profit: null,
        problem: "No se pudo leer su informe.",
      });
      continue;
    }

    const totals = report.totals;

    const asRevenue = convert(totals.revenue, range.to, currency, target, rates);
    const asSpend = convert(totals.adSpend, range.to, currency, target, rates);
    const asProfit = convert(totals.netProfit, range.to, currency, target, rates);

    /*
     * Si falta el cambio, esta tienda no entra en el total.
     *
     * `convert` no devuelve el importe sin convertir cuando falla, y eso es a
     * propósito: sumar pesos como si fueran dólares multiplicaría el total por
     * mil y el número seguiría pareciendo un número.
     */
    const problem = asRevenue.problem || asSpend.problem || asProfit.problem;

    if (problem) {
      rows.push({
        name: store.name,
        id: store.id,
        currency,
        revenue: null,
        profit: null,
        problem,
      });
      continue;
    }

    revenue += asRevenue.amount;
    spend += asSpend.amount;
    profit += asProfit.amount;
    orders += totals.orders;

    rows.push({
      name: store.name,
      id: store.id,
      currency,
      revenue: asRevenue.amount,
      profit: asProfit.amount,
      problem: "",
    });
  }

  const left = rows.filter((row) => row.problem);
  const roas = spend > 0 ? revenue / spend : 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <DatosNav />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {describeRange(range)} · {stores.length} tiendas · todo en {target}
          <span className="text-slate-400 dark:text-slate-500">
            {" "}
            · el día se calcula en {timeZone}
          </span>
        </p>

        {/*
          Cambiar la moneda del total sin salir de aquí.

          Va como enlaces y no como desplegable porque el estado vive en la URL,
          igual que en el resto de Datos: así el informe se puede marcar y
          recargar sin perder en qué moneda se estaba mirando.
        */}
        <div className="flex flex-wrap gap-1">
          {[...new Set(stores.map((store) => code(store.shopCurrency) || "USD"))].map((currency) => (
            <Link
              key={currency}
              href={`/datos/todas?rango=${preset}&moneda=${currency}`}
              aria-current={currency === target ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                currency === target
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {currency}
            </Link>
          ))}
        </div>
      </div>

      {/*
        Lo que se quedó fuera va **arriba**, no en una nota al pie.

        Un total al que le falta una tienda se lee igual que uno completo. Si el
        aviso está debajo de la tabla, se ve después de haber creído la cifra.
      */}
      {left.length > 0 ? (
        <DataWarning title={`${left.length} tienda(s) no entran en este total`}>
          {left.map((row) => `${row.name}: ${row.problem}`).join(" · ")}
        </DataWarning>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Beneficio neto" value={money(profit, target)} />
        <MetricCard label="Ingresos" value={money(revenue, target)} />
        <MetricCard label="Publicidad" value={money(spend, target)} />
        <MetricCard label="Pedidos" value={String(orders)} />
        <MetricCard label="ROAS" value={times(roas)} />
        <MetricCard label="Margen" value={pct(margin)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Tienda</th>
              <th className="px-3 py-2">Moneda</th>
              <th className="px-3 py-2 text-right">Ingresos ({target})</th>
              <th className="px-3 py-2 text-right">Beneficio ({target})</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <Link
                    href={`/datos?tienda=${row.id}&rango=${preset}`}
                    className="text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.currency}</td>
                <td className="px-3 py-2 text-right">
                  {row.revenue === null ? "—" : money(row.revenue, target)}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.profit === null ? "—" : money(row.profit, target)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
