import { SectionCard } from "@/components/section-card";
import { listRuns, totalsOf } from "@/lib/data/runs";
import { repeatsALot, since, spendByKind, spendByModel, spendByProduct } from "@/lib/spend";
import type { SpendRow } from "@/lib/spend";

export const metadata = { title: "Gasto" };

const usd = (value: number) =>
  value.toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/*
 * Una tabla y no un gráfico.
 *
 * Lo que se hace con este dato es decidir dónde tocar, y para eso hace falta el
 * número exacto y el orden — no la forma de la curva. Un gráfico de seis barras
 * ocupa el triple y dice menos.
 */
function Tabla({ title, rows, note }: { title: string; rows: SpendRow[]; note?: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Todavía no hay llamadas registradas.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {note ? <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{note}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 pr-3">Qué</th>
              <th className="py-1 pr-3 text-right">Coste</th>
              <th className="py-1 pr-3 text-right">Llamadas</th>
              <th className="py-1 pr-3 text-right">Entrada</th>
              <th className="py-1 pr-3 text-right">Salida</th>
              <th className="py-1 text-right">Fallidas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100 dark:border-slate-900">
                <td className="py-1 pr-3">{row.key}</td>
                <td className="py-1 pr-3 text-right font-medium">{usd(row.costUsd)}</td>
                <td className="py-1 pr-3 text-right">{row.runs}</td>
                <td className="py-1 pr-3 text-right">{row.inputTokens.toLocaleString("es-ES")}</td>
                <td className="py-1 pr-3 text-right">{row.outputTokens.toLocaleString("es-ES")}</td>
                {/* Lo fallido en rojo y con su coste: se pagó igual. */}
                <td className="py-1 text-right">
                  {row.failed > 0 ? (
                    <span className="text-rose-600 dark:text-rose-400">
                      {row.failed} · {usd(row.wastedUsd)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function GastoPage() {
  /*
   * Las últimas mil llamadas, no todas.
   *
   * Es lo que se puede leer de una tacada sin que la página tarde, y para
   * decidir dónde tocar sobra: lo que cuesta dinero aparece en las primeras
   * cien. Se dice cuántas se están mirando para que nadie lea el total como si
   * fuera la factura del mes.
   */
  const runs = await listRuns(1_000).catch(() => []);

  const mes = new Date();
  mes.setDate(mes.getDate() - 30);
  const recientes = since(runs, mes.toISOString());

  const totales = totalsOf(recientes);
  const porTipo = spendByKind(recientes);
  const repetitivos = repeatsALot(porTipo);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gasto</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          En qué se va el dinero, de más caro a más barato. La intuición sobre esto es mala: lo que
          parece caro son unas pocas llamadas grandes, y lo que suma de verdad suelen ser las tandas
          —decenas de peticiones baratas que nadie cuenta.
        </p>
      </header>

      <SectionCard
        title="Últimos 30 días"
        description="Sobre las últimas mil llamadas registradas, no sobre el histórico entero."
      >
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-2xl font-semibold">{usd(totales.costUsd)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {totales.runs} llamadas · {recientes.length} de {runs.length} leídas
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold">
              {(totales.inputTokens + totales.outputTokens).toLocaleString("es-ES")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">tokens en total</p>
          </div>

          {/*
            Lo que vino de la caché. Es el número que dice si sirve.
            En cero no significa que esté rota: significa que todavía no se ha
            puesto. La caché de prompts no falla si sale mal —sigue todo igual y
            se paga entero—, así que este contador va **antes** que ella.
          */}
          <div>
            <p className="text-2xl font-semibold">
              {totales.cacheReadTokens.toLocaleString("es-ES")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              tokens leídos de caché
              {totales.cacheReadTokens === 0 ? " · aún sin activar" : ""}
            </p>
          </div>
        </div>

        {repetitivos.length > 0 ? (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              <strong>Donde hay margen:</strong>{" "}
              {repetitivos.map((one) => one.key).join(", ")}. Son muchas llamadas seguidas con mucha
              entrada y poca salida, o sea el mismo contexto reenviado una y otra vez. Es lo que
              arregla la caché de prompts, y no cambia ni un resultado.
            </p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Por tipo de trabajo" description="Por dónde empezar a optimizar.">
        <Tabla title="" rows={porTipo} />
      </SectionCard>

      <SectionCard title="Por modelo" description="Qué se está usando y cuánto cuesta cada uno.">
        <Tabla title="" rows={spendByModel(recientes)} />
      </SectionCard>

      <SectionCard title="Por producto" description="Cuánto ha costado sacar adelante cada uno.">
        <Tabla title="" rows={spendByProduct(recientes)} />
      </SectionCard>
    </div>
  );
}
