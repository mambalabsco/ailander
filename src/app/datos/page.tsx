import Link from "next/link";
import { JobsPanel } from "@/components/jobs-panel";
import { AutoSyncSpend } from "@/components/datos/auto-sync";
import { ProfitChart } from "@/components/datos/profit-chart";
import { DataWarning, MetricCard, money, pct, times } from "@/components/datos/metrics";
import { DatosHeader } from "@/app/datos/header";
import { bucketRows, grainFrom, loadReport, reportContext } from "@/app/datos/report";
import { change, pointsChange, sumRows } from "@/lib/profit";
import { daysIn } from "@/lib/date-range";
import { gatewaysInUse, lastSyncedOrderDate, variantsSold } from "@/lib/data/analytics";
import { listJobsByKind } from "@/lib/data/jobs";

/**
 * El panel: las doce cifras que resumen si el negocio gana dinero.
 *
 * El orden no es decorativo. Arriba el beneficio neto, que es la respuesta a la
 * pregunta. Debajo, en fila, lo que lo explica —ingresos, costos, publicidad— y
 * solo después las razones. Un panel que empieza por el ROAS invita a optimizar
 * una métrica que se puede subir perdiendo dinero.
 */

interface PageProps {
  searchParams: Promise<{ tienda?: string; rango?: string; desde?: string; hasta?: string }>;
}

export default async function DatosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, range, comparison } = context;

  const jobs = await listJobsByKind("datos");

  if (!store) {
    return (
      <div className="space-y-6">
        <DatosHeader context={context} synced={false} />
      </div>
    );
  }

  const lastOrder = await lastSyncedOrderDate(store.id);

  const [report, gateways, variants] = await Promise.all([
    loadReport(store.id, range, comparison, { currency, timeZone: context.timeZone }),
    gatewaysInUse(store.id),
    variantsSold(store.id),
  ]);

  const { kpis: now, previous } = report;

  /*
   * Los dos huecos de configuración que inflan el beneficio en silencio.
   *
   * Ninguno de los dos da error: una variante sin coste de mercancía y una
   * pasarela sin comisión simplemente restan cero, y el beneficio sale más alto
   * de lo real. Es el fallo más peligroso de todo el panel porque el número
   * resultante es perfectamente creíble.
   */
  const missingCogs = variants.filter((variant) => variant.cogs === null);
  const missingFees = gateways.filter((gateway) => !gateway.configured);
  const noZones = report.settings.shippingZones.length === 0 && now.orders > 0;

  /*
   * Gasto que no se pudo pasar a la moneda del panel.
   *
   * Va en el mismo aviso que lo demás y por la misma razón: todo lo que hace que
   * el beneficio salga **más alto** del real está junto. Un gasto que no se suma
   * es un gasto que no se resta.
   */
  const unconverted = now.adSpendUnconverted;

  const grain = grainFrom(undefined, daysIn(range));
  const points = bucketRows(report.rows, grain).map((bucket) => {
    const totals = sumRows(bucket.rows);
    return {
      label: bucket.label,
      revenue: totals.revenue,
      adSpend: totals.adSpend,
      netProfit: totals.netProfit,
    };
  });

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      {/*
        El gasto de Meta se pide al abrir, no cuando alguien se acuerda.

        Antes solo entraba pulsando «Sincronizar», así que el panel enseñaba las
        cifras de la última vez que a alguien se le ocurrió — con el beneficio más
        alto del real, porque le faltaba el gasto de hoy.
      */}
      {store ? (
        <AutoSyncSpend
          storeId={store.id}
          from={context.range.from}
          to={context.range.to}
          enabled={report.activeAccounts > 0}
        />
      ) : null}

      {jobs.length > 0 ? (
        <JobsPanel productId="" jobs={jobs} storeLevel />
      ) : null}

      {/* Los avisos van antes de las cifras. Después de ellas ya se han leído. */}
      {missingCogs.length > 0 || missingFees.length > 0 || noZones || unconverted > 0 ? (
        <DataWarning title="El beneficio que sale aquí es más alto que el real">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {missingCogs.length > 0 ? (
              <li>
                {missingCogs.length} variante(s) vendidas sin coste de mercancía puesto:{" "}
                {missingCogs
                  .slice(0, 3)
                  .map((variant) => variant.title)
                  .join(", ")}
                {missingCogs.length > 3 ? "…" : ""}
              </li>
            ) : null}
            {missingFees.length > 0 ? (
              <li>
                {missingFees.length} pasarela(s) sin comisión:{" "}
                {missingFees.map((gateway) => gateway.gateway).join(", ")}
              </li>
            ) : null}
            {noZones ? <li>No hay ninguna zona de envío, así que el envío cuenta cero.</li> : null}
            {unconverted > 0 ? (
              <li>
                {unconverted} día(s) de gasto en otra moneda que no se pudo cambiar a {currency}, y
                por eso no está sumado. Vuelve a abrir el panel en un rato: el cambio se pide solo.
              </li>
            ) : null}
          </ul>
          <Link
            href={`/datos/costos?tienda=${store.id}`}
            className="mt-2 inline-block font-medium text-amber-900 underline underline-offset-4 dark:text-amber-200"
          >
            Completar los costos
          </Link>
        </DataWarning>
      ) : null}

      {report.activeAccounts === 0 ? (
        <DataWarning title="No hay ninguna cuenta publicitaria activa">
          El gasto publicitario cuenta cero, así que el beneficio neto y el ROAS de esta pantalla no
          son reales.{" "}
          <Link
            href={`/datos/conexiones?tienda=${store.id}`}
            className="font-medium underline underline-offset-4"
          >
            Conectar Meta o Google
          </Link>
        </DataWarning>
      ) : null}

      {/* --- La respuesta, y lo que la explica --- */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          hero
          label="Beneficio neto"
          value={money(now.netProfit, currency)}
          change={change(now.netProfit, previous.netProfit)}
        />

        {/*
          El margen y el ROI, con su propia tarjeta.

          Estaban de nota pequeña bajo el beneficio, y son las dos cifras que
          contestan «¿esto va bien?» — el beneficio en euros no lo dice sin saber
          cuánto se vendió para sacarlo.

          Su variación va en **puntos**, no en porcentaje: un margen que pasa del
          10% al 12% subió dos puntos, y «+20%» se lee como que subió veinte.
        */}
        <MetricCard
          label="Margen neto"
          value={pct(now.netMargin, 1)}
          change={pointsChange(now.netMargin, previous.netMargin)}
          changeUnit=" pts"
          hint="beneficio ÷ ingresos"
        />
        <MetricCard
          label="ROI"
          value={pct(now.roi, 1)}
          change={pointsChange(now.roi, previous.roi)}
          changeUnit=" pts"
          hint="beneficio ÷ lo que costó"
        />
        <MetricCard
          label="Ingresos"
          value={money(now.revenue, currency)}
          change={change(now.revenue, previous.revenue)}
          hint={`brutas ${money(now.grossSales, currency)}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Costos totales"
          value={money(now.totalCosts, currency)}
          change={change(now.totalCosts, previous.totalCosts)}
          invert
        />

        {/*
          Ya convertido a la moneda del panel. Antes se sumaban dólares y pesos
          como si fueran lo mismo: 23,77 USD salía escrito «23,77 CLP».
        */}
        <MetricCard
          label="Gasto publicitario"
          value={money(now.adSpend, currency)}
          change={change(now.adSpend, previous.adSpend)}
          hint={
            now.adSpendApprox
              ? `Alguna cuenta factura en otra moneda y se ha cambiado a ${currency}. Para alguna divisa se usa el cambio de hoy: la fuente gratuita no da histórico.`
              : undefined
          }
          invert
        />
        <MetricCard
          label="Beneficio bruto"
          value={money(now.grossProfit, currency)}
          change={change(now.grossProfit, previous.grossProfit)}
        />
        <MetricCard
          label="Pedidos"
          value={now.orders.toLocaleString("es-ES")}
          change={change(now.orders, previous.orders)}
          hint={`${now.unitsSold.toLocaleString("es-ES")} unidades`}
        />
        <MetricCard
          label="Ticket medio"
          value={now.aov === null ? "—" : money(now.aov, currency)}
          change={change(now.aov ?? 0, previous.aov ?? 0)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          Los dos ROAS, uno al lado del otro y con nombres distintos.
          El de la red se calcula con lo que ella declara haber vendido; el real,
          con el dinero que entró en la tienda. Cuando se separan mucho, el
          problema es la ventana de atribución — y eso solo se ve si se ven los
          dos.
        */}
        <MetricCard
          label="ROAS real"
          value={times(now.realRoas)}
          change={change(now.realRoas ?? 0, previous.realRoas ?? 0)}
          hint="ingresos ÷ publicidad"
        />
        <MetricCard
          label="ROAS que declara la red"
          value={times(now.reportedRoas)}
          hint="para comparar, no para decidir"
        />
        <MetricCard
          label="Coste por cliente nuevo"
          value={now.cac === null ? "—" : money(now.cac, currency)}
          change={change(now.cac ?? 0, previous.cac ?? 0)}
          invert
        />
        <MetricCard
          label="Clics / CTR"
          value={now.ctr === null ? "—" : pct(now.ctr)}
          hint={
            now.cpc === null
              ? `${report.totals.clicks.toLocaleString("es-ES")} clics`
              : `${report.totals.clicks.toLocaleString("es-ES")} clics · ${money(now.cpc, currency)} por clic`
          }
        />
      </div>

      <ProfitChart points={points} currency={currency} />

      {/*
        El enlace a Campañas va justo después del gráfico y no en la navegación
        solo: el panel dice si el negocio gana dinero, y la siguiente pregunta
        —«¿por culpa de qué campaña?»— es la que lleva a actuar.
      */}
      {report.activeAccounts > 0 ? (
        <Link
          href={`/datos/campanas?tienda=${store.id}&rango=${context.preset}`}
          className="block rounded-3xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <p className="font-medium">Ver qué campaña funciona →</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Con tu margen del{" "}
            {now.revenue > 0 ? pct((now.grossProfit / now.revenue) * 100, 0) : "—"}, el ROAS de
            equilibrio está en{" "}
            {now.grossProfit > 0 && now.revenue > 0
              ? times(now.revenue / now.grossProfit)
              : "—"}
            . Por debajo de ahí, una campaña pierde dinero por alto que parezca su número.
          </p>
        </Link>
      ) : null}

      {/* --- El desglose de costos, en la misma pantalla --- */}

      {/*
        La clase `viz` no es decoración: los colores de datos son variables
        definidas **dentro** de `.viz`, así que fuera de ella `var(--viz-ramp-3)`
        no resuelve a nada. Y un `background-color` inválido no da error — deja
        la barra transparente, que es lo que pasaba aquí: las barras existían,
        medían lo que tenían que medir y no se veían.
      */}
      <section className="viz rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">En qué se fue el dinero</h2>

        <ul className="mt-4 space-y-2">
          {[
            { label: "Mercancía", value: now.cogs },
            { label: "Envío", value: now.shippingCost },
            { label: "Comisiones de pasarela", value: now.transactionFees },
            { label: "Publicidad", value: now.adSpend },
            { label: "Costos propios", value: now.customCosts },
          ].map((item) => {
            // Sobre los costos totales, no sobre los ingresos: así los cinco
            // suman cien y se ve el peso de cada uno dentro del gasto.
            const share = now.totalCosts > 0 ? (item.value / now.totalCosts) * 100 : 0;

            return (
              <li key={item.label} className="flex items-center gap-3">
                <span className="w-52 shrink-0 text-sm text-slate-600 dark:text-slate-300">
                  {item.label}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-lg"
                    style={{
                      width: `${Math.max(share, 0)}%`,
                      backgroundColor: "var(--viz-ramp-3)",
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums">
                  {money(item.value, currency)}
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {now.totalCosts > 0 ? `${share.toFixed(0)}%` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
