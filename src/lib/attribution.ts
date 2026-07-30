/**
 * Cruce de gasto publicitario con dinero cobrado.
 *
 * Sin imports, como `profit.ts` y `date-range.ts`, y por lo mismo: es lógica de
 * emparejar cadenas que la gente escribe a mano en los parámetros de sus
 * anuncios, y ahí es donde salen los casos raros. Las pruebas están en
 * `attribution.test.ts`.
 *
 * ## Lo que hace y lo que no
 *
 * **No es un modelo de atribución.** No reparte el mérito entre varios anuncios
 * ni pondera por ventanas de tiempo. Empareja el `utm_campaign` de un pedido con
 * el nombre de una campaña, y suma. Es lo que se puede afirmar con los datos que
 * hay, y hacer más sería inventar precisión.
 *
 * **Lo que no empareja se enseña, no se reparte.** Los pedidos sin UTM van a su
 * propio grupo con su nombre —«sin atribuir»— en vez de repartirse
 * proporcionalmente entre las campañas. Repartirlos daría a cada campaña un ROAS
 * más bonito y falso; verlos juntos dice cuánto del negocio no se sabe de dónde
 * viene, que es un dato en sí.
 */

export interface AttributableOrder {
  id: string;
  total: number;
  landingPage: string;
  utm: Record<string, string>;
  isFirstOrder: boolean;
}

export interface AttributableCampaign {
  provider: "facebook" | "google";
  accountName: string;
  campaignRef: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reportedPurchases: number;
  reportedValue: number;
  /**
   * Moneda de la **cuenta publicitaria**, que puede no ser la de la tienda.
   *
   * Viaja con la campaña porque el gasto no se convierte: aplicar el tipo de
   * cambio de hoy a un gasto de marzo daría una cifra que parece exacta y no lo
   * es. La interfaz enseña cada importe con su moneda y quien mira lo sabe.
   */
  currency: string;
}

export interface CampaignPerformance extends AttributableCampaign {
  /** Pedidos e ingresos que salieron de la tienda, no lo que declara la red. */
  orders: number;
  revenue: number;
  newCustomers: number;
  realRoas: number | null;
  cac: number | null;
  /** Beneficio antes de mercancía y envío: ingresos menos gasto publicitario. */
  contribution: number;
}

/** Normaliza para comparar: la gente escribe los UTM con mayúsculas y espacios. */
function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Empareja pedidos con campañas y devuelve el rendimiento de cada una.
 *
 * El emparejamiento se intenta en dos pasadas, de la más fiable a la menos:
 *
 *   1. `utm_campaign` **igual** al nombre de la campaña. Es lo que sale al poner
 *      `utm_campaign={{campaign.name}}` en el anuncio, que es la práctica normal.
 *   2. `utm_campaign` igual al **identificador** de la campaña, para quien usa
 *      `{{campaign.id}}`.
 *
 * No hay una tercera por subcadena a propósito: `220326_EN_US_TEST` es subcadena
 * de `220326_EN_US_TESTCREPEY`, y una coincidencia parcial asignaría las ventas
 * de una campaña a otra sin que nada avise.
 */
export function attributeOrders(
  orders: AttributableOrder[],
  campaigns: AttributableCampaign[],
): { campaigns: CampaignPerformance[]; unattributed: { orders: number; revenue: number } } {
  const byName = new Map<string, AttributableCampaign>();
  const byRef = new Map<string, AttributableCampaign>();

  for (const campaign of campaigns) {
    if (campaign.campaignName) byName.set(key(campaign.campaignName), campaign);
    if (campaign.campaignRef) byRef.set(key(campaign.campaignRef), campaign);
  }

  const sales = new Map<string, { orders: number; revenue: number; newCustomers: number }>();
  const unattributed = { orders: 0, revenue: 0 };

  for (const order of orders) {
    const campaignUtm = order.utm.campaign ?? "";
    const matched = campaignUtm
      ? (byName.get(key(campaignUtm)) ?? byRef.get(key(campaignUtm)))
      : undefined;

    if (!matched) {
      unattributed.orders += 1;
      unattributed.revenue += order.total;
      continue;
    }

    const id = `${matched.provider}:${matched.campaignRef}:${matched.campaignName}`;
    const current = sales.get(id) ?? { orders: 0, revenue: 0, newCustomers: 0 };
    current.orders += 1;
    current.revenue += order.total;
    if (order.isFirstOrder) current.newCustomers += 1;
    sales.set(id, current);
  }

  const result = campaigns.map((campaign) => {
    const id = `${campaign.provider}:${campaign.campaignRef}:${campaign.campaignName}`;
    const matched = sales.get(id) ?? { orders: 0, revenue: 0, newCustomers: 0 };

    return {
      ...campaign,
      orders: matched.orders,
      revenue: matched.revenue,
      newCustomers: matched.newCustomers,
      realRoas: campaign.spend > 0 ? matched.revenue / campaign.spend : null,
      cac: matched.newCustomers > 0 ? campaign.spend / matched.newCustomers : null,
      contribution: matched.revenue - campaign.spend,
    };
  });

  // Por gasto, no por ingresos: lo primero que se busca es dónde se está yendo
  // el dinero, y una campaña que gasta mucho y no vende nada tiene que salir
  // arriba, no al final.
  return { campaigns: result.sort((a, b) => b.spend - a.spend), unattributed };
}

export interface LandingPerformance {
  landingPage: string;
  orders: number;
  revenue: number;
  newCustomers: number;
  aov: number | null;
}

/**
 * Rendimiento por página de aterrizaje.
 *
 * Sale del `landingPage` de la primera visita que guarda Shopify en su servidor,
 * así que **no lo bloquea ningún bloqueador de anuncios** —a diferencia de un
 * pixel, que pierde entre el 15% y el 30% del tráfico, y justo el más rentable—.
 *
 * Es la primera visita y no la última: la landing es lo que **abrió** la
 * relación. Atribuir al último clic daría el mérito a la página de producto que
 * el cliente vio justo antes de pagar, que no hizo el trabajo.
 */
export function landingPerformance(orders: AttributableOrder[]): LandingPerformance[] {
  const grouped = new Map<string, { orders: number; revenue: number; newCustomers: number }>();

  for (const order of orders) {
    const landing = order.landingPage || "(sin página registrada)";
    const current = grouped.get(landing) ?? { orders: 0, revenue: 0, newCustomers: 0 };
    current.orders += 1;
    current.revenue += order.total;
    if (order.isFirstOrder) current.newCustomers += 1;
    grouped.set(landing, current);
  }

  return [...grouped.entries()]
    .map(([landingPage, values]) => ({
      landingPage,
      ...values,
      aov: values.orders > 0 ? values.revenue / values.orders : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Cuánto del negocio se sabe de dónde viene.
 *
 * Es el indicador de calidad de todo lo demás en esta pestaña: con un 20% de
 * pedidos atribuidos, el ROAS por campaña es una anécdota. Sin este número, esa
 * tabla se lee como si fuera completa.
 */
export function attributionCoverage(orders: AttributableOrder[]): number | null {
  if (orders.length === 0) return null;

  const withUtm = orders.filter((order) => Boolean(order.utm.campaign)).length;
  return (withUtm / orders.length) * 100;
}
