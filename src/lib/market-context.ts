import "server-only";

import type { Product } from "@/types";
import type { Store } from "@/types/store";
import { findMarket } from "@/types/store";
import { findStore } from "@/lib/store-registry";
import { listProductMarkets } from "@/lib/data/product-markets";
import { resolvePrice } from "@/lib/market-price";
import { parseSelection, type MarketContext } from "@/lib/market-selection";
import { currencyOf } from "@/lib/money";

/**
 * El mercado y el precio que ve un encargo, resueltos desde la base.
 *
 * Es el único sitio donde se junta «en qué mercado estoy mirando» con «qué
 * precio toca». Las acciones de servidor llaman aquí y pasan el parámetro
 * `mercado` de la URL tal cual; no deciden nada por su cuenta.
 *
 * ## El caso que no se puede romper
 *
 * Un producto sin filas en `product_markets` —los de la competencia, que no
 * tienen tienda, y todos los demás mientras la migración no esté aplicada— tiene
 * que seguir comportándose **exactamente como antes**: su país, su idioma y su
 * precio base.
 *
 * Sin esta salida, el día que esto se despliegue y antes de que corra la
 * migración, todos los encargos de la plataforma se quedarían sin precio y sin
 * país. No daría ningún error: simplemente saldrían textos peores y nadie
 * sabría por qué.
 */
export async function marketContextFor(
  product: Product,
  mercado?: string,
): Promise<MarketContext> {
  const store = product.storeId ? await findStore(product.storeId) : null;
  const prices = await listProductMarkets(product.id);

  if (prices.length === 0) return legacyContext(product, store);

  const selection = parseSelection(
    mercado,
    prices.map((item) => item.marketId),
  );

  if (selection.kind === "general") {
    // General: ni país ni precio. Es el modo entero, no una carencia de datos.
    return { market: null, price: null, selection };
  }

  const market = store ? findMarket(store, selection.marketId) : undefined;

  return {
    market: market
      ? {
          countryName: market.countryName,
          languageName: market.languageName,
          currency: market.currency,
        }
      : // El mercado está en `product_markets` pero su tienda ya no lo tiene:
        // se cayó a mitad de un borrado. Mejor lo del producto que nada.
        briefFromProduct(product, store),
    price: resolvePrice(selection, prices),
    selection,
  };
}

/** Lo de siempre: el país, el idioma y el precio escritos en la ficha. */
function legacyContext(product: Product, store: Store | null): MarketContext {
  return {
    market: briefFromProduct(product, store),
    price: product.price > 0 ? { amount: product.price, source: "manual" } : null,
    /*
     * Se sella con el mercado base, que es con el que la migración etiqueta todo
     * lo que ya existe. Así, lo que se genere antes de migrar queda igual que lo
     * de antes en vez de quedar marcado como general —o sea, como válido en
     * países donde nadie ha comprobado que lo sea—.
     */
    selection: product.marketId
      ? { kind: "market", marketId: product.marketId }
      : { kind: "general" },
  };
}

function briefFromProduct(product: Product, store: Store | null) {
  return {
    countryName: product.country,
    languageName: product.language,
    currency: currencyOf(product, store),
  };
}
