import { DatosHeader } from "@/app/datos/header";
import { DataWarning, money, pct, times } from "@/components/datos/metrics";
import { reportContext } from "@/app/datos/report";
import {
  attributeOrders,
  attributionCoverage,
  landingPerformance,
} from "@/lib/attribution";
import {
  lastSyncedOrderDate,
  readAttribution,
  readCampaignSpend,
} from "@/lib/data/analytics";

/**
 * De dónde viene el dinero: campaña a campaña y landing a landing.
 *
 * Las dos tablas de esta pestaña se leen **después** del porcentaje de cobertura
 * que hay arriba, y por eso está arriba. Con un 20% de pedidos atribuidos, el
 * ROAS por campaña es una anécdota, y una tabla sin ese contexto se lee como si
 * fuera completa.
 *
 * Los ingresos de aquí son los cobrados en Shopify, no lo que declara la red. Se
 * enseñan las dos cifras al lado porque su diferencia es un diagnóstico: cuando
 * Meta declara el doble, lo que está mal es la ventana de atribución.
 */

interface PageProps {
  searchParams: Promise<{ tienda?: string; rango?: string; desde?: string; hasta?: string }>;
}

export default async function AtribucionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, range } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [orders, spend, lastOrder] = await Promise.all([
    readAttribution(store.id, range.from, range.to),
    readCampaignSpend(store.id, range.from, range.to),
    lastSyncedOrderDate(store.id),
  ]);

  const { campaigns, unattributed } = attributeOrders(orders, spend);
  const landings = landingPerformance(orders);
  const coverage = attributionCoverage(orders);

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      {/* --- La calidad del dato, antes que el dato --- */}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Pedidos con campaña marcada</p>
          <p className="mt-2 text-2xl font-semibold">{pct(coverage, 0)}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {orders.length - unattributed.orders} de {orders.length}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Sin atribuir</p>
          <p className="mt-2 text-2xl font-semibold">{money(unattributed.revenue, currency)}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {unattributed.orders} pedido(s) ·{" "}
            {totalRevenue > 0 ? pct((unattributed.revenue / totalRevenue) * 100, 0) : "—"} del total
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Campañas con gasto</p>
          <p className="mt-2 text-2xl font-semibold">{campaigns.length}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {money(
              campaigns.reduce((sum, item) => sum + item.spend, 0),
              currency,
            )}{" "}
            en total
          </p>
        </div>
      </div>

      {coverage !== null && coverage < 60 ? (
        <DataWarning title="La mayoría de los pedidos no dice de qué campaña vino">
          Para que esta tabla sirva, los anuncios tienen que llevar{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">
            utm_campaign=&#123;&#123;campaign.name&#125;&#125;
          </code>{" "}
          en la URL de destino. Sin eso, las ventas no se pueden asignar a ninguna campaña y el ROAS
          por campaña de abajo sale más bajo del real.
        </DataWarning>
      ) : null}

      {/* --- Campañas --- */}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Por campaña</h2>

        {campaigns.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No hay gasto publicitario guardado en este periodo. Conecta Meta o Google en Conexiones y
            sincroniza.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-left font-medium">Campaña</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Gasto
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Pedidos
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Ingresos
                  </th>
                  <th className="px-4 py-3 text-right font-medium">ROAS real</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    ROAS red
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    CAC
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    CTR
                  </th>
                </tr>
              </thead>

              <tbody>
                {campaigns.map((item) => {
                  const reportedRoas = item.spend > 0 ? item.reportedValue / item.spend : null;

                  return (
                    <tr
                      key={`${item.provider}:${item.campaignRef}`}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                    >
                      <td className="px-4 py-2">
                        <p className="font-medium">{item.campaignName || "(sin nombre)"}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.provider === "facebook" ? "Meta" : "Google"} · {item.accountName}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {money(item.spend, item.currency)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{item.orders}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {money(item.revenue, currency)}
                      </td>
                      {/*
                        El ROAS real se colorea porque es la única columna sobre
                        la que se decide algo. El umbral es 1: por debajo, la
                        campaña no paga ni el producto.
                      */}
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums ${
                          item.realRoas === null
                            ? ""
                            : item.realRoas < 1
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {times(item.realRoas)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {times(reportedRoas)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {item.cac === null ? "—" : money(item.cac, currency)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {item.impressions > 0
                          ? pct((item.clicks / item.impressions) * 100, 2)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Landings --- */}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Por página de aterrizaje</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sale de la primera visita que Shopify guarda en su servidor, así que no lo bloquea ningún
          bloqueador de anuncios.
        </p>

        {landings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No hay pedidos en este periodo.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-left font-medium">Página</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Pedidos
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Clientes nuevos
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Ingresos</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Ticket medio
                  </th>
                </tr>
              </thead>

              <tbody>
                {landings.map((item) => (
                  <tr
                    key={item.landingPage}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{item.landingPage}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{item.orders}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {item.newCustomers}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {money(item.revenue, currency)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {item.aov === null ? "—" : money(item.aov, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
