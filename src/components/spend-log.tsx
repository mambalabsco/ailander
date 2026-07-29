import { SectionCard } from "@/components/section-card";
import type { RunRecord, RunTotals } from "@/lib/data/runs";

/**
 * Lo que ha costado usar la plataforma.
 *
 * **Enseña también las tandas que fallaron**, y no es un descuido: un informe
 * que se generó pero no se pudo leer se cobró igual. Un historial que solo
 * cuenta los éxitos da una cifra más bonita y equivocada.
 *
 * Los precios son los escritos en el código, así que esto es un orden de
 * magnitud fiable, no una factura. La factura la manda Anthropic.
 */

const KIND_LABELS: Record<string, string> = {
  investigacion: "Investigación",
  extraccion: "Extracción",
  copy: "Redacción",
  imagen: "Imagen",
};

function money(value: number): string {
  // Cuatro decimales por debajo de un céntimo: las extracciones cuestan tan poco
  // que a dos decimales todas saldrían «$0,00» y parecerían gratis.
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function tokens(value: number): string {
  return value.toLocaleString("es-ES");
}

export function SpendLog({ runs, totals }: { runs: RunRecord[]; totals: RunTotals }) {
  if (runs.length === 0) {
    return (
      <SectionCard title="Gasto" description="Lo que ha costado cada generación">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay generaciones registradas. Aparecerán aquí en cuanto lances una, con su
          coste.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Gasto" description={`${totals.runs} generaciones registradas`}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Coste total" value={money(totals.costUsd)} emphasis />
        <Stat label="Tokens de entrada" value={tokens(totals.inputTokens)} />
        <Stat label="Tokens de salida" value={tokens(totals.outputTokens)} />
        <Stat label="Búsquedas web" value={tokens(totals.webSearches)} />
      </div>

      {/* La tabla se desborda en móvil antes que la página: sin esto, el ancho
          de la tabla empuja el cuerpo entero y aparece scroll horizontal. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-3 font-medium">Cuándo</th>
              <th className="py-2 pr-3 font-medium">Qué</th>
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="py-2 pr-3 font-medium">Modelo</th>
              <th className="py-2 pr-3 text-right font-medium">Entrada</th>
              <th className="py-2 pr-3 text-right font-medium">Salida</th>
              <th className="py-2 pr-3 text-right font-medium">Coste</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-900"
              >
                <td className="py-2 pr-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                  {new Date(run.createdAt).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-2 pr-3">
                  <span className={run.status === "error" ? "text-rose-600 dark:text-rose-400" : ""}>
                    {KIND_LABELS[run.kind] ?? run.kind}
                    {run.detail ? `: ${run.detail}` : ""}
                  </span>
                  {run.status === "error" ? (
                    <span
                      className="ml-2 text-xs text-rose-600 dark:text-rose-400"
                      title={run.error ?? ""}
                    >
                      (falló, pero se cobró)
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                  {run.productName ?? "—"}
                </td>
                <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{run.model ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{tokens(run.inputTokens)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{tokens(run.outputTokens)}</td>
                <td className="py-2 pr-3 text-right font-medium tabular-nums">
                  {money(run.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Coste calculado con los precios por millón de tokens escritos en la aplicación, más ~$0,01
        por búsqueda web. Es un orden de magnitud fiable; la factura real la emite Anthropic.
      </p>
    </SectionCard>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${
          emphasis ? "text-xl text-violet-700 dark:text-violet-300" : "text-lg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
