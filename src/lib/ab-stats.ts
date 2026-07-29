import type { AttributedOrder } from "@/lib/shopify";

/**
 * Comparar landings entre sí, y cada una con cada anuncio.
 *
 * **La cifra más útil que da esto es «todavía no se sabe».** Declarar un ganador
 * pronto es el error más caro y más común de una prueba A/B: con veinte pedidos
 * por variante, una diferencia del 30% se explica sola por azar más de una vez
 * de cada cinco.
 */

export interface VariantStats {
  /** La ruta de la página, o el anuncio, según cómo se agrupe. */
  key: string;
  orders: number;
  revenue: number;
  currency: string;
}

/** Agrupa los pedidos por la página de entrada. */
export function byLanding(orders: AttributedOrder[]): VariantStats[] {
  return group(orders, (order) => order.landingPath ?? "(sin página registrada)");
}

/** Agrupa por anuncio: `utm_content` es donde va el identificador del anuncio. */
export function byAd(orders: AttributedOrder[], landingPath?: string): VariantStats[] {
  const relevant = landingPath
    ? orders.filter((order) => order.landingPath === landingPath)
    : orders;

  return group(relevant, (order) => order.utm.content ?? "(sin anuncio etiquetado)");
}

function group(orders: AttributedOrder[], key: (order: AttributedOrder) => string): VariantStats[] {
  const map = new Map<string, VariantStats>();

  for (const order of orders) {
    const id = key(order);
    const current = map.get(id) ?? { key: id, orders: 0, revenue: 0, currency: order.currency };

    current.orders += 1;
    current.revenue += order.total;
    map.set(id, current);
  }

  return [...map.values()].sort((a, b) => b.orders - a.orders);
}

export interface Verdict {
  /** Si ya se puede decidir con los datos que hay. */
  decided: boolean;
  winner?: string;
  message: string;
}

/**
 * Cuántos pedidos hacen falta antes de mirar siquiera.
 *
 * No es un umbral estadístico fino: es el suelo por debajo del cual ninguna
 * prueba estadística tendría potencia. Mirar antes solo produce decisiones
 * caras tomadas sobre ruido.
 */
const MINIMUM_PER_VARIANT = 25;

/**
 * ¿Hay un ganador?
 *
 * Se usa una comparación de dos proporciones sobre el reparto de pedidos: si las
 * variantes recibieran tráfico parecido, cada una debería llevarse una parte
 * parecida. Se exige una diferencia grande **y** volumen suficiente.
 *
 * **No sustituye a mirar el coste por adquisición.** Esto dice qué landing
 * convierte más de lo que le llega; si una recibe el triple de tráfico, gana por
 * volumen y no por mérito. Por eso el mensaje avisa cuando el reparto es
 * desigual.
 */
export function judge(stats: VariantStats[]): Verdict {
  const ranked = [...stats].filter((item) => !item.key.startsWith("("));

  if (ranked.length < 2) {
    return { decided: false, message: "Hace falta más de una variante con pedidos para comparar." };
  }

  const [first, second] = ranked;
  const total = ranked.reduce((sum, item) => sum + item.orders, 0);

  if (second.orders < MINIMUM_PER_VARIANT) {
    return {
      decided: false,
      message: `Todavía no hay datos suficientes: la segunda variante lleva ${second.orders} pedido(s) y hacen falta al menos ${MINIMUM_PER_VARIANT}. Decidir ahora sería decidir sobre ruido.`,
    };
  }

  /*
   * Error estándar de la diferencia de proporciones.
   *
   * Se compara la cuota de pedidos de cada variante sobre el total. Dos errores
   * estándar es, a grandes rasgos, el 95% de confianza habitual.
   */
  const p1 = first.orders / total;
  const p2 = second.orders / total;
  const pooled = (first.orders + second.orders) / (2 * total);
  const standardError = Math.sqrt((2 * pooled * (1 - pooled)) / total);

  if (standardError === 0 || Math.abs(p1 - p2) < 2 * standardError) {
    return {
      decided: false,
      message: `«${first.key}» va por delante, pero la diferencia todavía cabe dentro del azar. Deja correr la prueba.`,
    };
  }

  const advantage = Math.round(((first.orders - second.orders) / second.orders) * 100);

  return {
    decided: true,
    winner: first.key,
    message: `«${first.key}» lleva un ${advantage}% más de pedidos que «${second.key}» con volumen suficiente. Comprueba que ambas recibieran un tráfico parecido antes de apagar la perdedora.`,
  };
}
