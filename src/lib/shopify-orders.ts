import "server-only";

import { shopifyGraphql } from "@/lib/shopify";
import type { Store } from "@/types/store";

/**
 * Descarga de pedidos con todo lo que hace falta para calcular el beneficio.
 *
 * Está aparte de `shopify.ts` porque es otro trabajo: aquel publica páginas y
 * sube imágenes, esto trae dinero. Comparten el cliente y nada más.
 *
 * ## Decisiones que no son obvias, y que están verificadas contra la
 * ## documentación de la versión 2026-07, no deducidas
 *
 * **`shopMoney`, nunca `presentmentMoney`.** El cliente mexicano paga en pesos y
 * el chileno en pesos chilenos, pero la tienda liquida en una sola moneda y es
 * en esa en la que hay que sumar. `presentmentMoney` daría el importe que vio el
 * cliente, y sumar pesos con dólares produce un número que parece un total.
 *
 * **`customerOrderIndex`** dice la posición de este pedido en el historial del
 * cliente. Vale 1 en la primera compra, y es la única forma fiable de contar
 * clientes nuevos: `customer.numberOfOrders` es el recuento de *hoy*, así que
 * quien ya compró tres veces haría que su primer pedido, de hace un año,
 * dejase de contarse como nuevo y el coste de adquisición saliera inflado.
 *
 * **`quantity` menos `currentQuantity`** son las unidades devueltas.
 * `refundableQuantity` parece lo mismo y no lo es: mide lo que *se puede*
 * devolver todavía, que en un pedido ya cerrado es cero aunque nadie devolviera
 * nada.
 *
 * **Las ventas brutas se suman de las líneas**, no de `subtotalPriceSet`. Aquel
 * ya viene con los descuentos aplicados, y el informe necesita las dos cifras
 * por separado para poder enseñar cuánto se está regalando en descuentos.
 */

const PAGE_SIZE = 50;

export interface SyncedOrderLine {
  productRef: string;
  variantRef: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  refundedQuantity: number;
}

export interface SyncedOrder {
  shopifyRef: string;
  name: string;
  processedAt: string;
  currency: string;
  grossSales: number;
  discounts: number;
  returns: number;
  taxes: number;
  shippingCharged: number;
  tips: number;
  total: number;
  gateway: string;
  financialStatus: string;
  test: boolean;
  customerRef: string;
  isFirstOrder: boolean;
  countryCode: string;
  landingPage: string;
  utm: Record<string, string>;
  lines: SyncedOrderLine[];
}

/** Datos de la tienda que hacen falta para interpretar sus importes. */
export interface ShopProfile {
  name: string;
  currency: string;
  /** `America/Mexico_City`. Decide a qué día pertenece cada pedido. */
  timeZone: string;
}

export async function readShopProfile(store: Store): Promise<ShopProfile> {
  const data = await shopifyGraphql<{
    shop: { name: string; ianaTimezone: string; currencyCode: string };
  }>(store, `query { shop { name ianaTimezone currencyCode } }`);

  return {
    name: data.shop.name,
    currency: data.shop.currencyCode,
    timeZone: data.shop.ianaTimezone,
  };
}

const ORDERS_QUERY = `query pedidos($cursor: String, $query: String!, $size: Int!) {
  orders(first: $size, after: $cursor, query: $query, sortKey: PROCESSED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      processedAt
      test
      currencyCode
      displayFinancialStatus
      paymentGatewayNames
      totalDiscountsSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      totalRefundedShippingSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalTipReceivedSet { shopMoney { amount } }
      totalPriceSet { shopMoney { amount currencyCode } }
      shippingAddress { countryCodeV2 }
      billingAddress { countryCodeV2 }
      customer { id }
      customerJourneySummary {
        customerOrderIndex
        firstVisit {
          landingPage
          utmParameters { source medium campaign content term }
        }
      }
      lineItems(first: 100) {
        nodes {
          sku
          title
          quantity
          currentQuantity
          originalUnitPriceSet { shopMoney { amount } }
          totalDiscountSet { shopMoney { amount } }
          product { id }
          variant { id }
        }
      }
    }
  }
}`;

interface Money {
  shopMoney: { amount: string; currencyCode?: string };
}

interface OrderNode {
  id: string;
  name: string;
  processedAt: string;
  test: boolean;
  currencyCode: string;
  displayFinancialStatus: string | null;
  paymentGatewayNames: string[];
  totalDiscountsSet: Money;
  totalRefundedSet: Money;
  totalRefundedShippingSet: Money;
  totalTaxSet: Money;
  totalShippingPriceSet: Money;
  totalTipReceivedSet: Money;
  totalPriceSet: Money;
  shippingAddress: { countryCodeV2: string | null } | null;
  billingAddress: { countryCodeV2: string | null } | null;
  customer: { id: string } | null;
  customerJourneySummary: {
    customerOrderIndex: number | null;
    firstVisit: {
      landingPage: string | null;
      utmParameters: {
        source: string | null;
        medium: string | null;
        campaign: string | null;
        content: string | null;
        term: string | null;
      } | null;
    } | null;
  } | null;
  lineItems: {
    nodes: {
      sku: string | null;
      title: string;
      quantity: number;
      currentQuantity: number;
      originalUnitPriceSet: Money;
      totalDiscountSet: Money;
      product: { id: string } | null;
      variant: { id: string } | null;
    }[];
  };
}

/** `numeric` llega como texto y un nulo inesperado no debe volverse `NaN`. */
function amount(money: Money | null | undefined): number {
  const value = Number(money?.shopMoney?.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function toOrder(node: OrderNode): SyncedOrder {
  const lines: SyncedOrderLine[] = node.lineItems.nodes.map((line) => ({
    productRef: line.product?.id ?? "",
    variantRef: line.variant?.id ?? "",
    sku: line.sku ?? "",
    title: line.title,
    quantity: line.quantity,
    unitPrice: amount(line.originalUnitPriceSet),
    discount: amount(line.totalDiscountSet),
    refundedQuantity: Math.max(0, line.quantity - line.currentQuantity),
  }));

  const grossSales = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  /*
   * Las devoluciones son la parte de producto del reembolso.
   *
   * Se le quita el envío reembolsado porque ese ya se restó al no cobrarse, y
   * dejarlo dentro lo contaría dos veces: una en «devoluciones» y otra en
   * «envío cobrado».
   */
  const returns = Math.max(0, amount(node.totalRefundedSet) - amount(node.totalRefundedShippingSet));

  const visit = node.customerJourneySummary?.firstVisit;
  const utmSource = visit?.utmParameters;
  const utm: Record<string, string> = {};
  if (utmSource?.source) utm.source = utmSource.source;
  if (utmSource?.medium) utm.medium = utmSource.medium;
  if (utmSource?.campaign) utm.campaign = utmSource.campaign;
  if (utmSource?.content) utm.content = utmSource.content;
  if (utmSource?.term) utm.term = utmSource.term;

  return {
    shopifyRef: node.id,
    name: node.name,
    processedAt: node.processedAt,
    currency: node.totalPriceSet.shopMoney.currencyCode || node.currencyCode,
    grossSales,
    discounts: amount(node.totalDiscountsSet),
    returns,
    taxes: amount(node.totalTaxSet),
    shippingCharged: amount(node.totalShippingPriceSet),
    tips: amount(node.totalTipReceivedSet),
    total: amount(node.totalPriceSet),
    // La primera pasarela: un pedido con dos formas de pago es raro y su
    // comisión no se puede repartir sin saber cuánto fue con cada una.
    gateway: node.paymentGatewayNames[0] ?? "",
    financialStatus: node.displayFinancialStatus ?? "",
    test: node.test,
    customerRef: node.customer?.id ?? "",
    isFirstOrder: node.customerJourneySummary?.customerOrderIndex === 1,
    countryCode:
      node.shippingAddress?.countryCodeV2 ?? node.billingAddress?.countryCodeV2 ?? "",
    landingPage: visit?.landingPage ? pathOf(visit.landingPage) : "",
    utm,
    lines,
  };
}

/**
 * Todos los pedidos procesados en un rango de fechas.
 *
 * Se filtra por `processed_at` y no por `created_at` porque es la fecha en la
 * que el dinero se movió, que es la que cuadra con el extracto bancario y con la
 * que Shopify calcula sus propios informes.
 *
 * El paginado es de 50 y no de 250 a propósito: cada pedido arrastra hasta cien
 * líneas y el resumen del viaje del cliente, y el coste de una consulta en la
 * Admin API se cobra por el número de campos. Pedir 250 con este cuerpo agota el
 * cupo y devuelve un error de coste, que es el fallo que aparece justo cuando la
 * tienda empieza a vender.
 *
 * `onPage` permite ir guardando: una sincronización de tres meses puede tardar
 * minutos, y perderla entera porque falló la última página sería absurdo.
 */
export async function readOrders(
  store: Store,
  options: {
    from: string;
    to: string;
    onPage?: (orders: SyncedOrder[]) => Promise<void>;
    maxOrders?: number;
  },
): Promise<SyncedOrder[]> {
  const collected: SyncedOrder[] = [];
  const max = options.maxOrders ?? 10_000;
  let cursor: string | null = null;

  // `<=` en la fecha final incluye el día entero: Shopify compara contra las
  // 00:00, así que sin el `T23:59:59` se perdería el último día del rango.
  const query = `processed_at:>='${options.from}T00:00:00Z' processed_at:<='${options.to}T23:59:59Z'`;

  while (collected.length < max) {
    const data: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: OrderNode[];
      };
    } = await shopifyGraphql(store, ORDERS_QUERY, { cursor, query, size: PAGE_SIZE });

    const page = data.orders.nodes.map(toOrder);
    collected.push(...page);

    if (options.onPage && page.length > 0) await options.onPage(page);

    if (!data.orders.pageInfo.hasNextPage || !data.orders.pageInfo.endCursor) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  return collected;
}

/**
 * Las pasarelas que la tienda usa de verdad.
 *
 * La lista de comisiones no se escribe a mano: sale de los pedidos ya
 * sincronizados. Así, en cuanto se cobra por una pasarela nueva aparece sola en
 * la configuración pidiendo su porcentaje, en vez de restar cero en silencio.
 */
export function gatewaysIn(orders: SyncedOrder[]): string[] {
  const found = new Set<string>();
  for (const order of orders) {
    if (order.gateway) found.add(order.gateway);
  }
  return [...found].sort();
}
