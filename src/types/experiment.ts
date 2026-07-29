/**
 * Reparto de tráfico entre varias landings.
 *
 * El visitante entra por **una sola URL** y el servidor decide qué página le
 * toca según los pesos. Eso permite que un mismo anuncio reparta entre cinco
 * variantes, que es lo que no se puede hacer apuntando cada anuncio a una.
 */

export const FUNNEL_STEPS = ["visita", "carrito", "pasarela", "compra"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_LABELS: Record<FunnelStep, string> = {
  visita: "Visitas",
  carrito: "Añadió al carrito",
  pasarela: "Llegó a la pasarela",
  compra: "Compró",
};

export interface ExperimentVariant {
  id: string;
  landingId: string;
  /**
   * Peso relativo, no porcentaje.
   *
   * Así 30/30/40 y 3/3/4 se comportan igual, y añadir una quinta variante no
   * obliga a recalcular las otras cuatro para que sigan sumando cien.
   */
  weight: number;
}

export interface LandingExperiment {
  id: string;
  productId: string;
  name: string;
  /** El tramo de la URL: `/apps/lp/<slug>`. */
  slug: string;
  active: boolean;
  variants: ExperimentVariant[];
  createdAt: string;
}

/** El porcentaje real que se lleva cada variante, para enseñarlo. */
export function sharesOf(variants: ExperimentVariant[]): Map<string, number> {
  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  const shares = new Map<string, number>();

  for (const variant of variants) {
    shares.set(variant.id, total > 0 ? (variant.weight / total) * 100 : 0);
  }

  return shares;
}

/**
 * A qué variante le toca este visitante.
 *
 * **Determinista a partir del identificador del visitante**, no aleatorio: si
 * cada visita sorteara de nuevo, alguien que recarga vería otra página y sus
 * pasos se repartirían entre dos variantes, que arruina la medición.
 *
 * El sorteo lo hace el hash del identificador, que sí es aleatorio entre
 * personas distintas.
 */
export function pickVariant(
  variants: ExperimentVariant[],
  visitor: string,
): ExperimentVariant | null {
  const usable = variants.filter((variant) => variant.weight > 0);
  if (usable.length === 0) return null;

  const total = usable.reduce((sum, variant) => sum + variant.weight, 0);

  let hash = 2166136261;
  for (let index = 0; index < visitor.length; index += 1) {
    hash ^= visitor.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let point = hash % total;
  for (const variant of usable) {
    if (point < variant.weight) return variant;
    point -= variant.weight;
  }

  return usable[usable.length - 1];
}

export interface FunnelCounts {
  visita: number;
  carrito: number;
  pasarela: number;
  compra: number;
  /** Ingreso total de las compras, para el ticket medio. */
  revenue: number;
  currency: string;
}

export interface VariantFunnel {
  variantId: string;
  landingId: string;
  title: string;
  share: number;
  counts: FunnelCounts;
}

/** Ticket medio. Sin compras no es cero: es que no se sabe. */
export function aov(counts: FunnelCounts): number | null {
  return counts.compra > 0 ? counts.revenue / counts.compra : null;
}

/**
 * Los porcentajes del embudo, **cada paso sobre el anterior**.
 *
 * Es lo que dice dónde se pierde la gente. Medirlos todos sobre las visitas
 * escondería que el problema está entre el carrito y la pasarela, que es
 * justamente el tramo que se puede arreglar.
 */
export function funnelRates(counts: FunnelCounts): { step: FunnelStep; rate: number | null }[] {
  return [
    { step: "visita", rate: counts.visita > 0 ? 100 : null },
    { step: "carrito", rate: rate(counts.carrito, counts.visita) },
    { step: "pasarela", rate: rate(counts.pasarela, counts.carrito) },
    { step: "compra", rate: rate(counts.compra, counts.pasarela) },
  ];
}

function rate(step: number, previous: number): number | null {
  return previous > 0 ? (step / previous) * 100 : null;
}
