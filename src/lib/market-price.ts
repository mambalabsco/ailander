/**
 * El precio de un producto en un mercado.
 *
 * Sin imports, probado en `market-price.test.ts`.
 *
 * ## La cascada, y por qué el orden importa
 *
 * Manda el primero que exista: el precio escrito a mano, el convertido, y nada.
 * Redondear a `9.990` en Chile no sale de ninguna conversión, así que una
 * conversión no puede pisar nunca un precio escrito a mano. Aquí no es una
 * preferencia de la interfaz: el conversor filtra por `source`, y lo que es
 * `manual` no entra.
 *
 * ## Por qué un convertido no se publica
 *
 * Porque `$10.847` en una página se lee como un error de la tienda, no como un
 * precio. El convertido sirve para lo de dentro —comparar, el P&L, la gráfica— y
 * para ahorrar teclear; para salir a la calle hay que confirmarlo, y confirmarlo
 * lo vuelve manual.
 */

export type PriceSource = "manual" | "convertido" | "ninguno";

export interface MarketPrice {
  marketId: string;
  price: number | null;
  source: PriceSource;
  /** El día del cambio con el que se convirtió, congelado. */
  fxDay: string | null;
  /** La tasa usada, congelada. Se guarda para poder explicar el número. */
  fxRate: number | null;
}

/** En qué modo se está mirando el producto. */
export type Selection = { kind: "general" } | { kind: "market"; marketId: string };

export interface ResolvedPrice {
  amount: number;
  source: "manual" | "convertido";
}

export function resolvePrice(selection: Selection, prices: MarketPrice[]): ResolvedPrice | null {
  // En general no hay precio. No es que se enseñe vacío: no existe, porque no
  // hay uno solo y enseñar el de un país en la página de otro es peor que no
  // enseñar ninguno.
  if (selection.kind === "general") return null;

  const found = prices.find((item) => item.marketId === selection.marketId);
  if (!found || found.price === null || found.source === "ninguno") return null;

  return { amount: found.price, source: found.source };
}

/** Solo lo escrito a mano sale a la calle. */
export function canPublish(price: ResolvedPrice | null): boolean {
  return price?.source === "manual";
}

/*
 * Las terminaciones que se usan de verdad en cada moneda.
 *
 * La lista es corta a propósito: cubre los mercados con los que se trabaja en
 * vez de fingir que cubre el mundo. Una moneda que no está no propone nada, y
 * eso es mejor que proponer un redondeo inventado sobre una divisa que nadie
 * aquí sabe cómo se escribe en una tienda.
 */
const ENDINGS: Record<string, { step: number; ending: number }> = {
  CLP: { step: 1000, ending: 990 },
  COP: { step: 1000, ending: 990 },
  MXN: { step: 100, ending: 99 },
  ARS: { step: 1000, ending: 990 },
  EUR: { step: 1, ending: 0.99 },
  USD: { step: 1, ending: 0.99 },
  GBP: { step: 1, ending: 0.99 },
};

/**
 * El redondeo comercial más cercano hacia arriba, como **propuesta**.
 *
 * Nunca se aplica solo. Un redondeo automático que nadie mira es cómo `9.990` se
 * convierte en `10.000` en la página de alguien.
 */
export function commercialRounding(amount: number, currency: string): number | null {
  const rule = ENDINGS[currency.trim().toUpperCase()];
  if (!rule || !Number.isFinite(amount) || amount <= 0) return null;

  const floor = Math.floor(amount / rule.step) * rule.step;
  const candidate = floor + rule.ending;
  const rounded = candidate >= amount ? candidate : candidate + rule.step;
  const clean = Number(rounded.toFixed(2));

  // Proponer el número que ya hay sería un botón que no hace nada.
  return clean === amount ? null : clean;
}

/** Si la conversión es lo bastante vieja como para avisar de que lo es. */
export function isStale(fxDay: string | null, today: string, days = 30): boolean {
  if (!fxDay) return false;

  const from = Date.parse(`${fxDay}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;

  return (to - from) / 86_400_000 > days;
}

/**
 * La línea del precio para un encargo, o nada.
 *
 * Devuelve la cadena vacía cuando no hay precio para que el llamante la filtre y
 * la línea **desaparezca entera**. Escribir «Precio: 0» le está diciendo al
 * modelo que el producto es gratis.
 */
export function priceLine(label: string, price: ResolvedPrice | null, currency: string): string {
  if (!price) return "";
  return `${label}: ${price.amount} ${currency}`;
}
