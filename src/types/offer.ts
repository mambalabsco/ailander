/**
 * Ofertas de un producto.
 *
 * Un producto de respuesta directa casi nunca se vende a un solo precio. Con
 * Kaching Bundles y similares, lo normal es una escalera de packs donde el
 * precio por unidad baja con la cantidad, a veces con un regalo a partir de
 * cierto nivel, y en paralelo una suscripción con su propio descuento.
 *
 * Esto importa porque **el copy vende la oferta, no el producto**. Un anuncio
 * de fondo de embudo dice «3 frascos a 38 € cada uno, envío gratis y guía de
 * regalo», y sin esta información la plataforma solo sabe decir «749». También
 * decide qué se puede prometer: no se puede escribir «envío gratis» si el envío
 * gratis empieza en el pack de dos.
 *
 * El modelo es deliberadamente plano: una lista de niveles más un bloque de
 * suscripción. Las tiendas montan estas escaleras de formas muy distintas y
 * cualquier estructura más rígida acabaría sin poder representar la mitad.
 */

/** Un peldaño de la escalera de packs. */
export interface OfferTier {
  id: string;
  /** Cómo lo llama la tienda: «1 frasco», «Pack 3», «Tratamiento completo». */
  label: string;
  /** Unidades que incluye. 1 para la compra suelta. */
  quantity: number;
  /** Precio total del pack, en la moneda del mercado. */
  totalPrice: number;
  /** Precio tachado, si la tienda muestra uno. */
  compareAtPrice?: number;
  /** Envío gratis a partir de este nivel. */
  freeShipping: boolean;
  /** Regalos que entran con este nivel: guía, frasco extra, neceser… */
  gifts: string[];
  /** El que la tienda destaca como recomendado. Solo uno debería serlo. */
  isHighlighted: boolean;
  note?: string;
}

/**
 * Suscripción.
 *
 * Se guarda aparte de los packs porque no es un peldaño más: convive con ellos
 * y su descuento se aplica sobre el precio de cada entrega.
 */
export interface SubscriptionOffer {
  enabled: boolean;
  /** Descuento sobre el precio unitario, en porcentaje. */
  discountPercent: number;
  /** «cada 30 días», «mensual», «cada 2 meses». */
  frequency: string;
  /** Ventajas propias de suscribirse, aparte del descuento. */
  perks: string[];
  cancellationPolicy: string;
}

export interface ProductOffers {
  tiers: OfferTier[];
  subscription: SubscriptionOffer;
  /** Garantía tal y como se anuncia: «60 días», «devolución sin preguntas». */
  guarantee: string;
  /** Umbral de envío gratis por importe, si la tienda lo tiene. */
  freeShippingThreshold?: number;
  /** De dónde salieron estos datos, para saber si hay que revisarlos. */
  source: "manual" | "importada";
  updatedAt: string;
}

export function emptyOffers(): ProductOffers {
  return {
    tiers: [],
    subscription: { enabled: false, discountPercent: 0, frequency: "", perks: [], cancellationPolicy: "" },
    guarantee: "",
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}

/** Precio por unidad de un peldaño. Es la cifra que de verdad usa el copy. */
export function unitPrice(tier: OfferTier): number {
  return tier.quantity > 0 ? tier.totalPrice / tier.quantity : tier.totalPrice;
}

/** Ahorro frente a comprar esa misma cantidad al precio de una unidad suelta. */
export function savingsVsSingle(tier: OfferTier, tiers: OfferTier[]): number {
  const single = tiers.find((item) => item.quantity === 1);
  if (!single || tier.quantity <= 1) return 0;
  return Math.max(0, single.totalPrice * tier.quantity - tier.totalPrice);
}

/**
 * La oferta contada en una línea, para meterla en los prompts.
 *
 * Sale ordenada por cantidad y con el ahorro ya calculado, porque pedirle al
 * modelo que haga la aritmética es una fuente de errores gratuita: el precio
 * por unidad de un pack de tres es un dato, no una deducción.
 */
export function describeOffers(offers: ProductOffers, currency: string): string {
  if (offers.tiers.length === 0 && !offers.subscription.enabled) return "";

  const lines: string[] = ["## Oferta", ""];

  const sorted = [...offers.tiers].sort((a, b) => a.quantity - b.quantity);
  for (const tier of sorted) {
    const savings = savingsVsSingle(tier, offers.tiers);
    const parts = [
      `- **${tier.label}**: ${tier.totalPrice} ${currency}`,
      tier.quantity > 1 ? `(${unitPrice(tier).toFixed(2)} ${currency} por unidad)` : "",
      tier.compareAtPrice ? `antes ${tier.compareAtPrice} ${currency}` : "",
      savings > 0 ? `ahorro de ${savings.toFixed(2)} ${currency}` : "",
      tier.freeShipping ? "envío gratis" : "",
      tier.gifts.length > 0 ? `regalo: ${tier.gifts.join(", ")}` : "",
      tier.isHighlighted ? "← el que la tienda destaca" : "",
      tier.note ?? "",
    ].filter(Boolean);
    lines.push(parts.join(" · "));
  }

  if (offers.subscription.enabled) {
    const subscription = offers.subscription;
    lines.push(
      "",
      `- **Suscripción**: ${subscription.discountPercent}% de descuento${
        subscription.frequency ? `, ${subscription.frequency}` : ""
      }${subscription.perks.length > 0 ? ` · ${subscription.perks.join(", ")}` : ""}${
        subscription.cancellationPolicy ? ` · ${subscription.cancellationPolicy}` : ""
      }`,
    );
  }

  if (offers.guarantee) lines.push("", `Garantía: ${offers.guarantee}`);
  if (offers.freeShippingThreshold) {
    lines.push(`Envío gratis a partir de ${offers.freeShippingThreshold} ${currency}.`);
  }

  lines.push(
    "",
    "Usa estas cifras tal cual. No inventes precios, descuentos ni regalos que no estén en esta lista, y no prometas envío gratis en niveles que no lo llevan.",
  );

  return lines.join("\n");
}
