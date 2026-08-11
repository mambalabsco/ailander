import type { RunRecord } from "@/lib/data/runs";

/**
 * En qué se va el dinero de la plataforma.
 *
 * ## Por qué medir antes de optimizar
 *
 * Porque la intuición sobre el gasto de un sistema así es mala. Lo que parece
 * caro —el copy largo, el guion de un vídeo— son unas pocas llamadas grandes;
 * lo que de verdad suma suelen ser las tandas: adaptar los textos de una página
 * copiada son decenas de peticiones seguidas, y nadie las cuenta porque cada
 * una es barata.
 *
 * Con esto se ordena por lo que cuesta, no por lo que se recuerda.
 *
 * ## Lo que fallo también se pagó
 *
 * Una llamada que termina en error consume igual: el modelo leyó la entrada y
 * escribió hasta donde llegó. Contarlo aparte es lo que convierte «los errores
 * molestan» en «los errores me costaron esto», que es un número con el que se
 * puede decidir.
 */

export interface SpendRow {
  key: string;
  runs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Cuántas fallaron. Se pagaron igual. */
  failed: number;
  /** Lo que costaron las que fallaron. */
  wastedUsd: number;
}

function fold(runs: RunRecord[], keyOf: (run: RunRecord) => string): SpendRow[] {
  const rows = new Map<string, SpendRow>();

  for (const run of runs) {
    const key = keyOf(run) || "(sin dato)";

    const row =
      rows.get(key) ??
      { key, runs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, failed: 0, wastedUsd: 0 };

    row.runs += 1;
    row.costUsd += run.costUsd;
    row.inputTokens += run.inputTokens;
    row.outputTokens += run.outputTokens;

    if (run.status === "error") {
      row.failed += 1;
      row.wastedUsd += run.costUsd;
    }

    rows.set(key, row);
  }

  // De más caro a más barato: es el orden en el que se decide qué tocar.
  return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export const spendByKind = (runs: RunRecord[]): SpendRow[] => fold(runs, (run) => run.kind);
export const spendByModel = (runs: RunRecord[]): SpendRow[] => fold(runs, (run) => run.model ?? "");
export const spendByProduct = (runs: RunRecord[]): SpendRow[] =>
  fold(runs, (run) => run.productName ?? "");

/** Lo gastado desde una fecha. Sin ella, todo. */
export function since(runs: RunRecord[], iso: string): RunRecord[] {
  return runs.filter((run) => run.createdAt >= iso);
}

/**
 * Cuánto cuesta de media un trabajo de este tipo.
 *
 * Es lo que permite decirle a alguien qué va a gastar **antes** de pulsar. Un
 * botón cuyo precio no se sabe es un botón que no se pulsa, y eso ya cuesta
 * dinero aunque no salga en ninguna factura: el documento se queda sin generar.
 *
 * Se usa la **mediana** y no la media: una tanda enorme desvía la media hacia
 * arriba y haría parecer caro lo que casi siempre es barato. La mediana dice lo
 * que pasa normalmente, que es lo que hay que anunciar.
 */
export function typicalCost(runs: RunRecord[], kind: string): number | null {
  const costs = runs
    .filter((run) => run.kind === kind && run.status === "ok")
    .map((run) => run.costUsd)
    .sort((a, b) => a - b);

  if (costs.length === 0) return null;

  const middle = Math.floor(costs.length / 2);

  return costs.length % 2 === 0 ? (costs[middle - 1] + costs[middle]) / 2 : costs[middle];
}

/**
 * Lo que se ahorraría cacheando el contexto que se repite.
 *
 * Es una **estimación**, y por eso se dice a partir de qué: en un tipo de
 * trabajo que hace muchas llamadas seguidas, la entrada se repite casi entera
 * de una a otra. Lo que no se repite es la salida.
 *
 * No se promete un porcentaje del total: se señala dónde mirar. Prometer un
 * ahorro exacto sobre una tarifa que cambia es la forma de que el número
 * envejezca mal y nadie vuelva a fiarse del panel.
 */
export function repeatsALot(rows: SpendRow[], minRuns = 20): SpendRow[] {
  return rows.filter((row) => row.runs >= minRuns && row.inputTokens > row.outputTokens * 3);
}
