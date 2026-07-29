import { FUNNEL_LABELS, FUNNEL_STEPS, funnelRates, type FunnelCounts } from "@/types/experiment";

/**
 * El embudo de una variante.
 *
 * Barras horizontales de ancho decreciente, que es la forma que hace visible
 * **dónde se cae la gente** de un vistazo. Cada porcentaje es sobre el paso
 * anterior, no sobre las visitas: medirlo todo contra las visitas escondería
 * que la fuga está entre el carrito y la pasarela, que es el tramo que se puede
 * arreglar.
 *
 * Un solo tono en degradado, no cinco colores: los pasos de un embudo son una
 * magnitud que decrece, no categorías distintas.
 */
export function FunnelChart({ counts }: { counts: FunnelCounts }) {
  const rates = funnelRates(counts);
  const top = counts.visita || 1;

  // Tonos de un mismo azul, de más oscuro a más claro según se avanza.
  const shades = ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa"];

  return (
    <div className="space-y-2">
      {FUNNEL_STEPS.map((step, index) => {
        const value = counts[step];
        const width = Math.max(2, (value / top) * 100);
        const rate = rates[index].rate;

        return (
          <div key={step} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-slate-600 dark:text-slate-300">
              {FUNNEL_LABELS[step]}
            </span>

            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
              <div
                className="flex h-full items-center rounded-lg px-2"
                style={{ width: `${width}%`, backgroundColor: shades[index] }}
              >
                <span className="text-xs font-semibold text-white tabular-nums">{value}</span>
              </div>
            </div>

            {/* El primer paso no lleva porcentaje: sería siempre 100% y no
                dice nada. Y un paso sin datos dice «—», no «0%». */}
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {index === 0 ? "" : rate === null ? "—" : `${rate.toFixed(1)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
