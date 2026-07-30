/**
 * Qué hacer con cada campaña.
 *
 * Sin imports, como los otros motores, y probado en `campaign-verdict.test.ts`.
 *
 * ## Por qué un ROAS de 2 no dice nada por sí solo
 *
 * Es el error que hace perder dinero con un panel delante. Un ROAS de 2 con un
 * margen de contribución del 70% deja beneficio; el mismo ROAS con un margen del
 * 30% pierde en cada venta. La cifra que decide es el **ROAS de equilibrio**:
 *
 *     equilibrio = 1 / margen de contribución
 *
 * Con un 70% de margen hace falta un ROAS de 1,43 para no perder. Con un 30%,
 * de 3,33. Son mundos distintos, y el mismo número —2— es bueno en uno y ruinoso
 * en el otro.
 *
 * El margen de contribución sale de los costos reales de la tienda —mercancía,
 * envío, comisiones—, no de un porcentaje escrito a mano. Por eso esta pantalla
 * depende de que los costos estén completos, y lo dice cuando no lo están.
 *
 * ## Y por qué el volumen importa tanto como el ROAS
 *
 * Una campaña con dos ventas y un ROAS de 6 no es una campaña ganadora, es una
 * campaña sin datos. Dar el mismo veredicto a esa y a una con doscientas ventas
 * es lo que lleva a escalar un accidente estadístico.
 */

export type Verdict = "escalar" | "mantener" | "vigilar" | "cortar" | "sin-datos";

export interface VerdictMeta {
  label: string;
  /** Qué hacer, en una frase. */
  action: string;
  /**
   * Estado, no serie: son los cuatro reservados y llevan siempre icono y
   * etiqueta, nunca solo color.
   */
  tone: "good" | "warning" | "serious" | "critical" | "neutral";
  icon: string;
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  escalar: {
    label: "Escalar",
    action: "Gana con holgura y tiene recorrido. Sube presupuesto.",
    tone: "good",
    icon: "▲",
  },
  mantener: {
    label: "Mantener",
    action: "Da beneficio sin margen de sobra. Déjala y vigila el coste.",
    tone: "neutral",
    icon: "=",
  },
  vigilar: {
    label: "Vigilar",
    action: "Está en el filo del equilibrio. Un cambio pequeño la vuelca.",
    tone: "warning",
    icon: "!",
  },
  cortar: {
    label: "Cortar",
    action: "Pierde dinero con datos suficientes. Párala.",
    tone: "critical",
    icon: "✕",
  },
  "sin-datos": {
    label: "Sin datos",
    action: "Todavía no ha gastado ni vendido lo bastante para juzgarla.",
    tone: "neutral",
    icon: "·",
  },
};

export interface VerdictInput {
  spend: number;
  revenue: number;
  orders: number;
  /**
   * Margen de contribución de la tienda, de 0 a 1.
   *
   * `null` cuando no se puede calcular —sin ventas o sin costos puestos—. En ese
   * caso no se inventa un valor: se devuelve «sin datos», porque un veredicto
   * calculado con un margen supuesto es peor que ninguno.
   */
  contributionMargin: number | null;
}

export interface VerdictResult {
  verdict: Verdict;
  roas: number | null;
  /** El ROAS que hace falta para no perder dinero. */
  breakevenRoas: number | null;
  /** Cuánto queda después de mercancía, envío, comisiones y publicidad. */
  contribution: number;
  /** Por qué salió este veredicto, en una frase. */
  reason: string;
}

/**
 * Pedidos mínimos para dar un veredicto.
 *
 * Cinco es bajo y es a propósito: con un umbral alto, una campaña que pierde
 * dinero desde el primer día se quedaría en «sin datos» durante semanas mientras
 * gasta. Cinco pedidos no dan certeza estadística, pero sí bastan para distinguir
 * «no funciona» de «todavía no se sabe».
 */
export const MIN_ORDERS = 5;

/**
 * Gasto mínimo para juzgar una campaña que no ha vendido nada.
 *
 * Sin este suelo, una campaña recién lanzada con tres euros gastados y cero
 * ventas saldría como «cortar». Se expresa en la moneda de la cuenta y se puede
 * ajustar: lo razonable es en torno a dos o tres veces el ticket medio.
 */
export function judge(input: VerdictInput, minSpend = 50): VerdictResult {
  const roas = input.spend > 0 ? input.revenue / input.spend : null;
  const margin = input.contributionMargin;
  const breakevenRoas = margin && margin > 0 ? 1 / margin : null;

  /*
   * La contribución es lo que de verdad queda: los ingresos por el margen, menos
   * lo que costó traerlos. Es la cifra que hay que mirar cuando el ROAS confunde,
   * porque está en dinero y no en veces.
   */
  const contribution = margin === null ? 0 - input.spend : input.revenue * margin - input.spend;

  const enough = input.orders >= MIN_ORDERS || input.spend >= minSpend;

  if (input.spend <= 0) {
    return {
      verdict: "sin-datos",
      roas,
      breakevenRoas,
      contribution,
      reason: "No ha gastado nada en este periodo.",
    };
  }

  if (margin === null || breakevenRoas === null) {
    return {
      verdict: "sin-datos",
      roas,
      breakevenRoas,
      contribution,
      reason:
        "No se sabe el margen de la tienda: faltan costos de mercancía, envío o comisiones. Sin eso no hay ROAS de equilibrio con el que comparar.",
    };
  }

  if (!enough) {
    return {
      verdict: "sin-datos",
      roas,
      breakevenRoas,
      contribution,
      reason: `Solo ${input.orders} pedido(s) y poco gasto. Con tan poco, un ROAS alto o bajo es azar.`,
    };
  }

  /*
   * Las bandas se definen **relativas al equilibrio**, no en números absolutos.
   *
   * Es lo que hace que el mismo umbral valga para una tienda con un 70% de margen
   * y para otra con un 30%. Un «ROAS mayor que 2 es bueno» escrito a mano sería
   * correcto en la primera y ruinoso en la segunda.
   */
  const ratio = (roas ?? 0) / breakevenRoas;

  if (ratio >= 1.4) {
    return {
      verdict: "escalar",
      roas,
      breakevenRoas,
      contribution,
      reason: `ROAS ${(roas ?? 0).toFixed(2)} contra un equilibrio de ${breakevenRoas.toFixed(2)}: un ${Math.round((ratio - 1) * 100)}% por encima.`,
    };
  }

  if (ratio >= 1.15) {
    return {
      verdict: "mantener",
      roas,
      breakevenRoas,
      contribution,
      reason: `Gana, pero con poco aire: ${(roas ?? 0).toFixed(2)} contra ${breakevenRoas.toFixed(2)}.`,
    };
  }

  if (ratio >= 1) {
    return {
      verdict: "vigilar",
      roas,
      breakevenRoas,
      contribution,
      reason: `Justo en el filo: ${(roas ?? 0).toFixed(2)} contra un equilibrio de ${breakevenRoas.toFixed(2)}. Una subida del coste la vuelca.`,
    };
  }

  return {
    verdict: "cortar",
    roas,
    breakevenRoas,
    contribution,
    reason: `ROAS ${(roas ?? 0).toFixed(2)} por debajo del equilibrio de ${breakevenRoas.toFixed(2)}: cada venta pierde dinero.`,
  };
}

/**
 * Margen de contribución de la tienda, de 0 a 1.
 *
 * Es el beneficio bruto sobre los ingresos: lo que queda de cada euro vendido
 * después de mercancía, envío y comisiones, y **antes** de publicidad. Antes de
 * publicidad a propósito: es la referencia contra la que se juzga la publicidad,
 * así que incluirla haría el razonamiento circular.
 *
 * Devuelve `null` sin ingresos, y también cuando el margen sale de cero o menos:
 * un margen negativo significa que se vende por debajo de coste, y ahí ninguna
 * campaña puede ser rentable — no hay ROAS de equilibrio que alcanzar.
 */
export function contributionMargin(revenue: number, grossProfit: number): number | null {
  if (revenue <= 0) return null;
  const margin = grossProfit / revenue;
  return margin > 0 ? margin : null;
}

/** Orden de lectura: primero lo que hay que tocar, y dentro por gasto. */
const PRIORITY: Record<Verdict, number> = {
  cortar: 0,
  vigilar: 1,
  escalar: 2,
  mantener: 3,
  "sin-datos": 4,
};

export function sortByAction<T extends { verdict: Verdict; spend: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.verdict !== b.verdict) return PRIORITY[a.verdict] - PRIORITY[b.verdict];
    return b.spend - a.spend;
  });
}

/**
 * Resumen para la cabecera: cuánto dinero hay en cada veredicto.
 *
 * Es lo más útil de la pantalla y por eso se calcula aparte: «1.200 € en
 * campañas que hay que cortar» mueve a actuar de una forma que «cuatro campañas
 * en rojo» no consigue.
 */
export function summarize<T extends { verdict: Verdict; spend: number; contribution: number }>(
  rows: T[],
): Record<Verdict, { count: number; spend: number; contribution: number }> {
  const empty = () => ({ count: 0, spend: 0, contribution: 0 });

  const summary: Record<Verdict, { count: number; spend: number; contribution: number }> = {
    escalar: empty(),
    mantener: empty(),
    vigilar: empty(),
    cortar: empty(),
    "sin-datos": empty(),
  };

  for (const row of rows) {
    const bucket = summary[row.verdict];
    bucket.count += 1;
    bucket.spend += row.spend;
    bucket.contribution += row.contribution;
  }

  return summary;
}
