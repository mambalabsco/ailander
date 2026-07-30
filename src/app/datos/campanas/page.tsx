import Link from "next/link";
import { DatosHeader } from "@/app/datos/header";
import { DataWarning, money, pct, times } from "@/components/datos/metrics";
import {
  CampaignTable,
  VerdictSummary,
  type CampaignRow,
} from "@/components/datos/campaign-board";
import { loadReport, reportContext } from "@/app/datos/report";
import { attributeOrders } from "@/lib/attribution";
import { contributionMargin, judge } from "@/lib/campaign-verdict";
import {
  lastSyncedOrderDate,
  readAttribution,
  readCampaignSpend,
} from "@/lib/data/analytics";

/**
 * Qué campaña funciona, y qué hacer con cada una.
 *
 * La cifra que manda esta pantalla no es el ROAS, es el **ROAS de equilibrio**:
 * el que hace falta para no perder dinero, que sale del margen real de la tienda.
 * Con un 70% de margen basta un 1,43; con un 30% hace falta un 3,33. El mismo
 * ROAS de 2 es bueno en la primera situación y ruinoso en la segunda, y es el
 * error que más dinero cuesta con un panel delante.
 *
 * Por eso esta pestaña **depende de que los costos estén completos** y lo dice
 * cuando no lo están, en vez de dar veredictos calculados con un margen supuesto.
 */

interface PageProps {
  searchParams: Promise<{ tienda?: string; rango?: string; desde?: string; hasta?: string }>;
}

export default async function CampanasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, range, comparison } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [report, orders, spend, lastOrder] = await Promise.all([
    loadReport(store.id, range, comparison, { currency, timeZone: context.timeZone }),
    readAttribution(store.id, range.from, range.to),
    readCampaignSpend(store.id, range.from, range.to),
    lastSyncedOrderDate(store.id),
  ]);

  /*
   * El margen sale de los costos reales de **toda** la tienda en el periodo, no
   * de cada campaña. Es deliberado: el margen es una propiedad del producto y de
   * la operación, no del anuncio, y calcularlo por campaña con pocos pedidos daría
   * un margen distinto en cada fila por puro azar.
   */
  const margin = contributionMargin(report.kpis.revenue, report.kpis.grossProfit);

  const { campaigns, unattributed } = attributeOrders(orders, spend);

  const rows: CampaignRow[] = campaigns.map((campaign) => {
    const verdict = judge({
      spend: campaign.spend,
      revenue: campaign.revenue,
      orders: campaign.orders,
      contributionMargin: margin,
    });

    return {
      key: `${campaign.provider}:${campaign.campaignRef}`,
      provider: campaign.provider,
      accountName: campaign.accountName,
      campaignName: campaign.campaignName,
      spend: campaign.spend,
      revenue: campaign.revenue,
      orders: campaign.orders,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      currency: campaign.currency || currency,
      verdict: verdict.verdict,
      roas: verdict.roas,
      breakevenRoas: verdict.breakevenRoas,
      contribution: verdict.contribution,
      reason: verdict.reason,
    };
  });

  const breakeven = margin && margin > 0 ? 1 / margin : null;

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      {/* --- La regla con la que se juzga todo lo de abajo --- */}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">La cifra que decide</h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Margen de contribución</p>
            <p className="mt-1 text-2xl font-semibold">
              {margin === null ? "—" : pct(margin * 100, 1)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              lo que queda de cada venta después de mercancía, envío y comisiones
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">ROAS de equilibrio</p>
            <p className="mt-1 text-2xl font-semibold">{times(breakeven)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              por debajo de esto, cada venta pierde dinero
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">ROAS real de la tienda</p>
            <p className="mt-1 text-2xl font-semibold">{times(report.kpis.realRoas)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {money(report.kpis.revenue, currency)} de ingresos ÷{" "}
              {money(report.kpis.adSpend, currency)} de publicidad
            </p>
          </div>
        </div>

        {margin !== null ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Con un margen del {pct(margin * 100, 0)}, un ROAS de{" "}
            <span className="font-medium">{times(breakeven)}</span> es el punto en el que no ganas ni
            pierdes. Todo lo que está por encima deja dinero; lo que está por debajo lo quema, por
            alto que parezca el número.
          </p>
        ) : null}
      </section>

      {margin === null ? (
        <DataWarning title="Sin el margen no se puede juzgar ninguna campaña">
          El ROAS de equilibrio sale de los costos reales de la tienda. Faltan costos de mercancía,
          envío o comisiones, así que abajo verás el gasto y los ingresos pero ningún veredicto —dar
          uno con un margen supuesto sería peor que no darlo—.{" "}
          <Link
            href={`/datos/costos?tienda=${store.id}`}
            className="font-medium underline underline-offset-4"
          >
            Completar los costos
          </Link>
        </DataWarning>
      ) : null}

      {unattributed.orders > 0 ? (
        <DataWarning title={`${unattributed.orders} pedido(s) no dicen de qué campaña vinieron`}>
          Son {money(unattributed.revenue, currency)} que no se le asignan a ninguna campaña, así que
          todos los ROAS de abajo salen más bajos del real. Se arregla añadiendo{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">
            utm_campaign=&#123;&#123;campaign.name&#125;&#125;
          </code>{" "}
          a la URL de destino de los anuncios.
        </DataWarning>
      ) : null}

      {/* --- El tablero --- */}

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No hay gasto publicitario en este periodo.{" "}
          <Link
            href={`/datos/conexiones?tienda=${store.id}`}
            className="font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
          >
            Conectar Meta o Google
          </Link>
        </div>
      ) : (
        <>
          <VerdictSummary rows={rows} currency={currency} />
          <CampaignTable rows={rows} currency={currency} />

          <p className="text-sm text-slate-500 dark:text-slate-400">
            El orden es por lo que hay que hacer, no por lo que más gasta: primero lo que hay que
            cortar. «Deja» es lo que queda después de mercancía, envío, comisiones y publicidad —en
            dinero, que es lo que se cobra, no en veces—.
          </p>
        </>
      )}
    </div>
  );
}
