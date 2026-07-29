import type { Product } from "@/types";
import type { Store } from "@/types/store";

/**
 * Formato de precios.
 *
 * El euro estaba escrito a mano en toda la interfaz, así que un producto de una
 * tienda mexicana mostraba «749 €». La moneda es del **mercado**, no de la
 * plataforma: sale de ahí y el formato se hace con la configuración regional de
 * ese mercado, que es la que decide si el símbolo va delante o detrás y si el
 * separador decimal es coma o punto.
 */

export const DEFAULT_CURRENCY = "EUR";

/** Moneda y configuración regional del mercado en el que vive un producto. */
export function marketMoney(
  product: Pick<Product, "storeId" | "marketId">,
  stores: Store[],
): { currency: string; locale: string } {
  const store = stores.find((item) => item.id === product.storeId);
  const market = store?.markets.find((item) => item.id === product.marketId);

  if (!market) return { currency: DEFAULT_CURRENCY, locale: "es-ES" };

  return {
    currency: market.currency || DEFAULT_CURRENCY,
    locale: `${market.languageCode}-${market.countryCode}`,
  };
}

/** Moneda del mercado de un producto, teniendo ya su tienda. */
export function currencyOf(
  product: Pick<Product, "marketId">,
  store?: Store | null,
): string {
  const market = store?.markets.find((item) => item.id === product.marketId);
  return market?.currency || DEFAULT_CURRENCY;
}

/**
 * Importe con su moneda.
 *
 * Si la configuración regional o la moneda no son válidas —datos escritos a
 * mano en el formulario de la tienda—, cae a un formato simple en vez de
 * romper la página entera por un código de tres letras mal puesto.
 */
export function formatMoney(
  amount: number,
  options?: { currency?: string; locale?: string },
): string {
  const currency = options?.currency || DEFAULT_CURRENCY;
  const locale = options?.locale || "es-ES";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Moneda probable de un país, para los productos sin tienda.
 *
 * Los de la competencia no viven en un mercado de la plataforma, así que no hay
 * de dónde sacar su moneda y caían todos a euros: un producto estadounidense de
 * 49 dólares aparecía como «49 €» y la comparación de precios salía falsa.
 *
 * Es una **conjetura razonable, no un dato**: solo se usa como valor inicial del
 * formulario, que después puedes corregir. Por eso la lista es corta y cubre los
 * mercados con los que se trabaja, en vez de fingir cubrir el mundo.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
  "estados unidos": "USD", "eeuu": "USD", "usa": "USD", "us": "USD",
  "méxico": "MXN", "mexico": "MXN", "mx": "MXN",
  "españa": "EUR", "espana": "EUR", "es": "EUR",
  "reino unido": "GBP", "uk": "GBP", "gb": "GBP",
  "colombia": "COP", "chile": "CLP", "argentina": "ARS", "perú": "PEN", "peru": "PEN",
  "canadá": "CAD", "canada": "CAD", "brasil": "BRL", "australia": "AUD",
};

export function currencyForCountry(country: string): string {
  return COUNTRY_CURRENCY[country.trim().toLowerCase()] ?? DEFAULT_CURRENCY;
}
