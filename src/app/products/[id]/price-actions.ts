"use server";

import { revalidatePath } from "next/cache";
import { ensureRates } from "@/lib/data/fx-rates";
import { pickRate } from "@/lib/fx";
import {
  addProductMarket,
  removeProductMarket,
  setConvertedPrice,
  setManualPrice,
} from "@/lib/data/product-markets";

/**
 * Los precios de un producto en cada uno de sus mercados.
 *
 * La regla que gobierna todo esto: **solo un precio escrito a mano se publica**.
 * Un convertido es una sugerencia —sirve para comparar y para el P&L— y para
 * salir a la calle hay que confirmarlo, que es lo que lo vuelve manual.
 */

export interface PriceResult {
  ok: boolean;
  message: string;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Convierte el precio base al de un mercado y **lo congela**.
 *
 * Se guardan el importe, el día y la tasa. Convertir al pintar haría que el
 * precio de la ficha cambiara solo cada mañana, y un número que baila no es un
 * precio: es lo mismo que ya se aprendió con el informe de un mes cerrado.
 */
export async function convertPriceAction(input: {
  productId: unknown;
  marketId: unknown;
  basePrice: unknown;
  baseCurrency: unknown;
  targetCurrency: unknown;
}): Promise<PriceResult> {
  const productId = readText(input.productId);
  const marketId = readText(input.marketId);
  const from = readText(input.baseCurrency);
  const to = readText(input.targetCurrency);
  const basePrice = Number(input.basePrice);

  if (!productId || !marketId) return { ok: false, message: "Falta el producto o el mercado." };
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return { ok: false, message: "El producto no tiene precio base desde el que convertir." };
  }
  if (!from || !to) return { ok: false, message: "Falta alguna de las dos monedas." };

  if (from === to) {
    // Misma moneda: no hay conversión que hacer, y llamar al cambio para que
    // devuelva 1 solo añadiría una petición y una fecha que no significa nada.
    await setManualPrice(productId, marketId, basePrice);
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: "Misma moneda que el precio base: se ha copiado tal cual." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const rates = await ensureRates([{ day: today, from, to }]);
  const rate = pickRate(rates, today, from, to);

  if (!rate) {
    return {
      ok: false,
      message: `No hay cambio de ${from} a ${to}. Escribe el precio a mano.`,
    };
  }

  await setConvertedPrice(productId, marketId, {
    price: Number((basePrice * rate.rate).toFixed(2)),
    fxDay: rate.day,
    fxRate: rate.rate,
  });

  revalidatePath(`/products/${productId}`);

  return {
    ok: true,
    message: rate.exact
      ? `Convertido con el cambio del ${rate.day}. Revísalo antes de publicar.`
      : `Convertido con el cambio de hoy aplicado al ${rate.day}: es una aproximación. Revísalo antes de publicar.`,
  };
}

/** El precio escrito a mano. Es el único que se puede publicar. */
export async function saveManualPriceAction(input: {
  productId: unknown;
  marketId: unknown;
  price: unknown;
}): Promise<PriceResult> {
  const productId = readText(input.productId);
  const marketId = readText(input.marketId);
  const price = Number(input.price);

  if (!productId || !marketId) return { ok: false, message: "Falta el producto o el mercado." };
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: "El precio tiene que ser un número positivo." };
  }

  await setManualPrice(productId, marketId, price);
  revalidatePath(`/products/${productId}`);

  return { ok: true, message: "Guardado. Ya se puede publicar en ese mercado." };
}

export async function addMarketAction(productId: unknown, marketId: unknown): Promise<PriceResult> {
  const id = readText(productId);
  const market = readText(marketId);
  if (!id || !market) return { ok: false, message: "Falta el producto o el mercado." };

  await addProductMarket(id, market);
  revalidatePath(`/products/${id}`);

  return { ok: true, message: "Mercado añadido. Ponle precio antes de publicar en él." };
}

/**
 * Quita un mercado del producto.
 *
 * Se lleva su precio, que es lo que se espera. Lo que **no** se lleva son las
 * piezas escritas para él: quedan como generales por el `on delete set null` de
 * la migración de etiquetas. Perder un mercado no puede significar perder el
 * trabajo de escribirlo.
 */
export async function removeMarketAction(
  productId: unknown,
  marketId: unknown,
): Promise<PriceResult> {
  const id = readText(productId);
  const market = readText(marketId);
  if (!id || !market) return { ok: false, message: "Falta el producto o el mercado." };

  await removeProductMarket(id, market);
  revalidatePath(`/products/${id}`);

  return { ok: true, message: "Mercado quitado. Sus textos quedan como generales." };
}
