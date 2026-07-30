import { formatMoney } from "@/lib/money";
import {
  VERDICT_META,
  sortByAction,
  summarize,
  type Verdict,
} from "@/lib/campaign-verdict";

/**
 * El tablero de campañas.
 *
 * ## El color nunca lleva la información solo
 *
 * Los cuatro colores de estado pasaron el validador de paletas en pares
 * adyacentes, pero el par rojo–verde es indistinguible para el daltonismo
 * rojo-verde y eso no se arregla cambiando el tono. Como el significado está
 * fijado por convención, la salida es la codificación redundante: **cada tarjeta
 * y cada fila llevan el icono y la palabra**, y los iconos tienen formas
 * distintas entre sí. Quitar la etiqueta para que quede más limpio rompería la
 * pantalla para una de cada doce personas.
 *
 * ## Y el orden es por lo que hay que hacer, no por lo que más gasta
 *
 * Primero «cortar», que es dinero que se está perdiendo ahora mismo, y dentro de
 * cada grupo por gasto. Ordenar por ROAS pondría arriba una campaña con dos
 * ventas y un ROAS de seis, que es justo la que no hay que tocar.
 */

const TONE_VAR: Record<VerdictMetaTone, string> = {
  good: "var(--viz-good)",
  warning: "var(--viz-warning)",
  serious: "var(--viz-warning)",
  critical: "var(--viz-critical)",
  neutral: "var(--viz-neutral)",
};

type VerdictMetaTone = (typeof VERDICT_META)[Verdict]["tone"];

export interface CampaignRow {
  key: string;
  provider: "facebook" | "google";
  accountName: string;
  campaignName: string;
  spend: number;
  revenue: number;
  orders: number;
  impressions: number;
  clicks: number;
  currency: string;
  verdict: Verdict;
  roas: number | null;
  breakevenRoas: number | null;
  contribution: number;
  reason: string;
}

const money = (value: number, currency: string) =>
  formatMoney(value, { currency, locale: "es-ES" });

/* ------------------------------- Resumen ---------------------------------- */

/**
 * Cuánto dinero hay en cada veredicto.
 *
 * Es lo más útil de la pantalla, y va arriba por eso: «1.200 € en campañas que
 * hay que cortar» mueve a actuar de una forma que «cuatro campañas en rojo» no
 * consigue. Los grupos vacíos no se pintan.
 */
export function VerdictSummary({
  rows,
  currency,
}: {
  rows: CampaignRow[];
  currency: string;
}) {
  const summary = summarize(rows);
  const order: Verdict[] = ["cortar", "vigilar", "mantener", "escalar", "sin-datos"];

  return (
    <div className="viz grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {order
        .filter((verdict) => summary[verdict].count > 0)
        .map((verdict) => {
          const meta = VERDICT_META[verdict];
          const bucket = summary[verdict];
          const color = TONE_VAR[meta.tone];

          return (
            <div
              key={verdict}
              className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              // Filete de color a la izquierda: identifica el grupo sin teñir el
              // texto, que siempre usa tokens de tinta.
              style={{ borderLeft: `4px solid ${color}` }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden style={{ color }}>
                  {meta.icon}
                </span>
                {meta.label}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  · {bucket.count}
                </span>
              </p>

              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {money(bucket.spend, currency)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">gastado</p>

              {verdict === "sin-datos" ? null : (
                <p className="mt-2 text-sm tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">deja </span>
                  <span
                    className={
                      bucket.contribution < 0
                        ? "font-medium text-rose-700 dark:text-rose-400"
                        : "font-medium text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {money(bucket.contribution, currency)}
                  </span>
                </p>
              )}

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{meta.action}</p>
            </div>
          );
        })}
    </div>
  );
}

/* -------------------------------- Tabla ----------------------------------- */

export function CampaignTable({
  rows,
  currency,
}: {
  rows: CampaignRow[];
  currency: string;
}) {
  const sorted = sortByAction(rows);

  // La barra se escala contra el mayor gasto, así que la longitud es comparable
  // entre filas sin necesidad de un eje.
  const maxSpend = Math.max(...rows.map((row) => row.spend), 1);

  return (
    <div className="viz overflow-x-auto rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="px-4 py-3 text-left font-medium">Qué hacer</th>
            <th className="px-4 py-3 text-left font-medium">Campaña</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
              Gasto
            </th>
            <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
              Ingresos
            </th>
            <th className="px-4 py-3 text-right font-medium">ROAS</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
              Equilibrio
            </th>
            <th className="px-4 py-3 text-right font-medium">Deja</th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => {
            const meta = VERDICT_META[row.verdict];
            const color = TONE_VAR[meta.tone];
            const share = (row.spend / maxSpend) * 100;

            return (
              <tr
                key={row.key}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
              >
                {/* Icono, palabra y color: los tres a la vez, siempre. */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: color }}
                  >
                    <span aria-hidden>{meta.icon}</span>
                    {meta.label}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <p className="font-medium">{row.campaignName || "(sin nombre)"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {row.provider === "facebook" ? "Meta" : "Google"} · {row.accountName} ·{" "}
                    {row.orders} pedido(s)
                  </p>
                  <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                    {row.reason}
                  </p>
                </td>

                <td className="px-4 py-3 text-right">
                  <p className="tabular-nums">{money(row.spend, row.currency)}</p>
                  {/* Barra fina para comparar magnitudes de un vistazo. */}
                  <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: color }}
                    />
                  </div>
                </td>

                <td className="px-4 py-3 text-right tabular-nums">
                  {money(row.revenue, currency)}
                </td>

                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {row.roas === null ? "—" : row.roas.toFixed(2)}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {row.breakevenRoas === null ? "—" : row.breakevenRoas.toFixed(2)}
                </td>

                <td
                  className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    row.contribution < 0
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {/* El signo va explícito: no depende del color para leerse. */}
                  {row.contribution >= 0 ? "+" : ""}
                  {money(row.contribution, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
