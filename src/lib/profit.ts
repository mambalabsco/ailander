/**
 * Beneficio real: el motor de cálculo.
 *
 * **Este archivo no importa nada.** Ni la base de datos, ni Shopify, ni React.
 * Recibe formas planas y devuelve números. Es a propósito: es el único sitio de
 * la plataforma donde un error de una línea falsea *todas* las cifras de todos
 * los paneles a la vez, así que tenía que poder probarse solo, sin servidor y
 * sin credenciales. Las pruebas están en `profit.test.ts`.
 *
 * ## Las fórmulas no son inventadas
 *
 * Están derivadas de las cifras reales de TrueProfit del usuario y cuadran al
 * céntimo con ellas. Se dejan escritas aquí porque la definición de «ingresos»
 * cambia según a quién se pregunte, y la que sirve es la que coincide con la
 * herramienta con la que se comparan los números:
 *
 *   ingresos      = brutas − descuentos − devoluciones + impuestos + envío cobrado
 *   beneficioBruto= ingresos − mercancía − envío − comisiones
 *   costosTotales = mercancía + envío + comisiones + publicidad + propios
 *   neto          = ingresos − costosTotales
 *   margen        = neto / ingresos
 *   roi           = neto / costosTotales
 *   ticketMedio   = ingresos / pedidos
 *   cac           = publicidad / clientes nuevos
 *
 * Los impuestos entran en los ingresos porque son dinero que entró en la cuenta.
 * Quien los declara aparte los verá en su propia línea del informe.
 *
 * ## Por qué se calcula día a día y después se agrupa
 *
 * Podría sumarse todo de golpe, pero entonces un sueldo mensual caería entero en
 * un solo día y el beneficio diario no querría decir nada. Calculando por día,
 * el reparto proporcional de los costos fijos y los porcentajes de los variables
 * salen solos, y el informe semanal, el mensual y el panel son la misma suma con
 * distinto grano.
 */

/* ------------------------------- Lo que entra ----------------------------- */

export interface OrderLine {
  productRef: string;
  variantRef: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  refundedQuantity: number;
}

export interface OrderInput {
  id: string;
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
  test: boolean;
  isFirstOrder: boolean;
  /** Código de país de envío, para elegir la zona de envío. */
  countryCode: string;
  lines: OrderLine[];
}

export interface SpendInput {
  provider: "facebook" | "google";
  day: string;
  campaignName: string;
  /** Ya en la moneda del panel, si se pidió convertir. */
  spend: number;
  /** En cuál está `spend`. */
  currency?: string;
  /** Lo que no se pudo cambiar, en su moneda: se cuenta pero no se suma. */
  unconverted?: { amount: number; currency: string };
  /** Si el cambio usado no era el de ese día. */
  approxRate?: boolean;
  impressions: number;
  clicks: number;
  reportedPurchases: number;
  reportedValue: number;
}

export interface CogsRule {
  productRef: string;
  /** Vacío significa «cualquier variante de este producto». */
  variantRef: string;
  amount: number;
}

export interface ShippingTier {
  qty: number;
  cost: number;
}

export interface ShippingZone {
  name: string;
  countries: string[];
  isDefault: boolean;
  tiers: ShippingTier[];
}

export interface GatewayFee {
  gateway: string;
  percent: number;
  fixed: number;
}

export type CustomCostKind = "fijo" | "variable";
export type CustomCostBasis =
  | "ingresos"
  | "ventas-brutas"
  | "beneficio-bruto"
  | "gasto-publicitario";
export type CustomCostRepeat = "ninguno" | "diario" | "semanal" | "mensual" | "anual";

export interface CustomCost {
  id: string;
  name: string;
  kind: CustomCostKind;
  amount: number;
  basis: CustomCostBasis;
  category: string;
  startsOn: string;
  endsOn: string;
  repeat: CustomCostRepeat;
  inLtvCac: boolean;
}

export interface CostSettings {
  cogs: CogsRule[];
  shippingZones: ShippingZone[];
  gatewayFees: GatewayFee[];
  customCosts: CustomCost[];
  /** Zona horaria de la tienda: decide a qué día pertenece cada pedido. */
  timeZone: string;
  currency: string;
}

/* ------------------------------- Lo que sale ------------------------------ */

export interface DayRow {
  day: string;

  grossSales: number;
  discounts: number;
  returns: number;
  taxes: number;
  shippingCharged: number;
  tips: number;

  orders: number;
  unitsSold: number;
  newCustomers: number;

  cogs: number;
  shippingCost: number;
  transactionFees: number;
  adSpend: number;
  adSpendByProvider: Record<string, number>;
  /**
   * Gasto que no se pudo pasar a la moneda del panel, **sin sumar**.
   *
   * Se cuenta aparte porque sumarlo sin cambiar es el fallo que esto venía a
   * arreglar, y esconderlo daría un total que parece completo y no lo está: el
   * beneficio saldría más alto del real, que es la dirección peligrosa.
   */
  adSpendUnconverted: number;
  /** Si algún día usó un cambio que no era el suyo. */
  adSpendApprox: boolean;
  customCosts: number;
  /** Costos propios marcados como de adquisición, para la relación LTV:CAC. */
  acquisitionCosts: number;

  reportedPurchases: number;
  reportedValue: number;
  impressions: number;
  clicks: number;
}

export interface Totals extends Omit<DayRow, "day"> {
  revenue: number;
  grossProfit: number;
  totalCosts: number;
  netProfit: number;
}

/* --------------------------------- Fechas --------------------------------- */

/**
 * El día al que pertenece un instante, en la zona horaria de la tienda.
 *
 * Importa más de lo que parece: un pedido de las 23:30 en Ciudad de México es de
 * las 05:30 del día siguiente en UTC. Cortar por UTC movería de día una parte de
 * los pedidos de cada noche, y el gasto publicitario —que Meta ya devuelve por
 * día en la zona de la cuenta— no cuadraría nunca con las ventas.
 *
 * `en-CA` da exactamente `AAAA-MM-DD`, que es el formato con el que se comparan
 * y ordenan las claves sin convertir nada.
 */
export function dayKey(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // Una zona horaria mal escrita no debe tirar el informe entero.
    return date.toISOString().slice(0, 10);
  }
}

/** Días de `AAAA-MM-DD` a `AAAA-MM-DD`, ambos incluidos. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return days;

  // Un tope de seguridad: sin él, un rango escrito a mano con un año mal puesto
  // haría un array de millones de entradas y colgaría el proceso.
  const limit = 366 * 5;
  for (let time = start, guard = 0; time <= end && guard < limit; time += 86_400_000, guard++) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  // Se recorta al último día del mes destino: un gasto que arranca el 31 de
  // enero y se repite cada mes no debe saltarse febrero.
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDate = Math.min(date, lastDay);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), safeDate))
    .toISOString()
    .slice(0, 10);
}

function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/* --------------------------------- Costos --------------------------------- */

/**
 * Coste de mercancía de una línea.
 *
 * Se busca primero la regla de la variante exacta y solo después la del producto.
 * El orden es lo que hace útil el atajo: se declara un coste para el producto y
 * se sobreescriben solo las variantes que se salen —el pack de tres, la talla
 * grande—, en vez de repetir el mismo número en cada una.
 *
 * Se cobra por unidad **no devuelta**: la mercancía de un pedido devuelto vuelve
 * al almacén, así que restarla sería contarla dos veces.
 */
export function cogsForLine(rules: CogsRule[], line: OrderLine): number {
  const units = Math.max(0, line.quantity - line.refundedQuantity);
  if (units === 0) return 0;

  const exact =
    line.variantRef &&
    rules.find((rule) => rule.variantRef && rule.variantRef === line.variantRef);
  if (exact) return exact.amount * units;

  const byProduct =
    line.productRef &&
    rules.find((rule) => !rule.variantRef && rule.productRef === line.productRef);
  if (byProduct) return byProduct.amount * units;

  return 0;
}

/**
 * Zona de envío de un pedido.
 *
 * La coincidencia por país gana siempre a la zona por defecto, que existe para
 * que ningún pedido se quede sin coste de envío: un pedido sin coste asignado
 * infla el beneficio en silencio, que es el peor de los errores posibles aquí.
 */
export function zoneFor(zones: ShippingZone[], countryCode: string): ShippingZone | null {
  const code = countryCode.trim().toUpperCase();

  const matched = zones.find((zone) =>
    zone.countries.some((item) => item.trim().toUpperCase() === code),
  );
  if (matched) return matched;

  return zones.find((zone) => zone.isDefault) ?? null;
}

/**
 * Coste de envío según la cantidad.
 *
 * Se aplica el tramo más alto que no pase de la cantidad enviada, porque el
 * envío no escala: mandar dos botes no cuesta el doble que uno. Así basta con
 * declarar los tramos en los que el coste cambia.
 *
 * Por encima del último tramo declarado se mantiene el de este —no se extrapola—.
 * Inventar una progresión daría un número que parece calculado y no lo está.
 */
export function shippingCostFor(zone: ShippingZone | null, quantity: number): number {
  if (!zone || zone.tiers.length === 0 || quantity <= 0) return 0;

  const sorted = [...zone.tiers].sort((a, b) => a.qty - b.qty);
  let cost = 0;
  let found = false;

  for (const tier of sorted) {
    if (tier.qty <= quantity) {
      cost = tier.cost;
      found = true;
    }
  }

  // Si el pedido lleva menos unidades que el tramo más bajo declarado, se usa
  // ese: es más razonable que cobrar cero.
  return found ? cost : sorted[0].cost;
}

/** Comisión de la pasarela: porcentaje del total más el importe fijo. */
export function gatewayFeeFor(fees: GatewayFee[], gateway: string, total: number): number {
  const key = gateway.trim().toLowerCase();
  const fee = fees.find((item) => item.gateway.trim().toLowerCase() === key);
  if (!fee) return 0;

  // Un pedido de cero —un reemplazo, un regalo— no genera comisión fija.
  if (total <= 0) return 0;

  return (total * fee.percent) / 100 + fee.fixed;
}

/**
 * Cuánto de un costo fijo corresponde a cada día.
 *
 * Devuelve un mapa día → importe. La clave está en el reparto proporcional: un
 * sueldo mensual dividido entre los días del mes deja ver el beneficio diario
 * real, mientras que cargarlo entero el día 1 haría que ese día pareciera una
 * catástrofe y los otros veintinueve una fiesta.
 *
 * Las repeticiones se expanden en ventanas consecutivas desde la fecha de
 * inicio, y cada ventana se reparte entre sus propios días.
 */
export function spreadFixedCost(cost: CustomCost): Map<string, number> {
  const perDay = new Map<string, number>();
  if (cost.kind !== "fijo" || cost.amount === 0) return perDay;

  const windows: { from: string; to: string }[] = [];
  const limit = 400; // Tope de seguridad, igual que en `daysBetween`.

  if (cost.repeat === "ninguno") {
    windows.push({ from: cost.startsOn, to: cost.endsOn });
  } else {
    let cursor = cost.startsOn;
    for (let guard = 0; cursor <= cost.endsOn && guard < limit; guard++) {
      const next =
        cost.repeat === "diario"
          ? addDays(cursor, 1)
          : cost.repeat === "semanal"
            ? addDays(cursor, 7)
            : cost.repeat === "mensual"
              ? addMonths(cursor, 1)
              : addMonths(cursor, 12);

      // La última ventana se recorta en la fecha de fin: un gasto mensual que
      // acaba a mitad de mes solo cuenta los días que estuvo activo.
      const to = addDays(next, -1);
      windows.push({ from: cursor, to: to > cost.endsOn ? cost.endsOn : to });
      cursor = next;
    }
  }

  for (const window of windows) {
    const days = daysBetween(window.from, window.to);
    if (days.length === 0) continue;

    const share = cost.amount / days.length;
    for (const day of days) {
      perDay.set(day, (perDay.get(day) ?? 0) + share);
    }
  }

  return perDay;
}

/** Si un costo variable está activo ese día. */
export function customCostActiveOn(cost: CustomCost, day: string): boolean {
  return day >= cost.startsOn && day <= cost.endsOn;
}

/* ------------------------------- El cálculo ------------------------------- */

/**
 * Los contadores a cero, sin día.
 *
 * Está separado de `emptyDay` porque un total no pertenece a ningún día, y
 * arrastrar un `day: ""` dentro de los totales invitaría a leerlo como si sí.
 */
function emptyCounters(): Omit<DayRow, "day"> {
  return {
    grossSales: 0,
    discounts: 0,
    returns: 0,
    taxes: 0,
    shippingCharged: 0,
    tips: 0,
    orders: 0,
    unitsSold: 0,
    newCustomers: 0,
    cogs: 0,
    shippingCost: 0,
    transactionFees: 0,
    adSpend: 0,
    adSpendByProvider: {},
    adSpendUnconverted: 0,
    adSpendApprox: false,
    customCosts: 0,
    acquisitionCosts: 0,
    reportedPurchases: 0,
    reportedValue: 0,
    impressions: 0,
    clicks: 0,
  };
}

function emptyDay(day: string): DayRow {
  return { day, ...emptyCounters() };
}

/** Ingresos de una fila: la fórmula está arriba, en la cabecera. */
export function revenueOf(row: Pick<DayRow, "grossSales" | "discounts" | "returns" | "taxes" | "shippingCharged">): number {
  return row.grossSales - row.discounts - row.returns + row.taxes + row.shippingCharged;
}

/**
 * Una fila por día del rango, con todo lo que entró y todo lo que costó.
 *
 * Los días sin nada también salen, con ceros. Es deliberado: un gráfico que se
 * salta los días vacíos comprime el tiempo y hace parecer continuo lo que fueron
 * tres días de ventas separados por una semana en blanco.
 */
export function dailyRows(input: {
  orders: OrderInput[];
  spend: SpendInput[];
  settings: CostSettings;
  from: string;
  to: string;
}): DayRow[] {
  const { orders, spend, settings, from, to } = input;

  const rows = new Map<string, DayRow>();
  for (const day of daysBetween(from, to)) rows.set(day, emptyDay(day));

  /* --- Lo que entró, y lo que costó servirlo --- */

  for (const order of orders) {
    // Los pedidos de prueba están en la base de datos para no volver a
    // descargarlos, pero no son dinero y no entran en ningún informe.
    if (order.test) continue;

    const day = dayKey(order.processedAt, settings.timeZone);
    const row = rows.get(day);
    if (!row) continue; // Fuera del rango pedido.

    row.grossSales += order.grossSales;
    row.discounts += order.discounts;
    row.returns += order.returns;
    row.taxes += order.taxes;
    row.shippingCharged += order.shippingCharged;
    row.tips += order.tips;
    row.orders += 1;
    if (order.isFirstOrder) row.newCustomers += 1;

    let units = 0;
    for (const line of order.lines) {
      units += Math.max(0, line.quantity - line.refundedQuantity);
      row.cogs += cogsForLine(settings.cogs, line);
    }
    row.unitsSold += units;

    row.shippingCost += shippingCostFor(zoneFor(settings.shippingZones, order.countryCode), units);
    row.transactionFees += gatewayFeeFor(settings.gatewayFees, order.gateway, order.total);
  }

  /* --- Lo que costó traerlo --- */

  for (const item of spend) {
    const row = rows.get(item.day);
    if (!row) continue;

    row.adSpend += item.spend;
    row.adSpendByProvider[item.provider] =
      (row.adSpendByProvider[item.provider] ?? 0) + item.spend;

    if (item.unconverted) row.adSpendUnconverted += 1;
    if (item.approxRate) row.adSpendApprox = true;
    row.impressions += item.impressions;
    row.clicks += item.clicks;
    row.reportedPurchases += item.reportedPurchases;
    row.reportedValue += item.reportedValue;
  }

  /* --- Costos propios --- */

  const fixedByDay = new Map<string, { amount: number; acquisition: number }>();
  for (const cost of settings.customCosts) {
    if (cost.kind !== "fijo") continue;
    for (const [day, amount] of spreadFixedCost(cost)) {
      const current = fixedByDay.get(day) ?? { amount: 0, acquisition: 0 };
      current.amount += amount;
      if (cost.inLtvCac) current.acquisition += amount;
      fixedByDay.set(day, current);
    }
  }

  for (const row of rows.values()) {
    const fixed = fixedByDay.get(row.day);
    if (fixed) {
      row.customCosts += fixed.amount;
      row.acquisitionCosts += fixed.acquisition;
    }

    /*
     * Los variables van después de los fijos y se calculan sobre las bases del
     * propio día. Ninguna base incluye los costos propios, así que no hay
     * circularidad: un porcentaje sobre el beneficio bruto no se muerde la cola.
     */
    const revenue = revenueOf(row);
    const grossProfit = revenue - row.cogs - row.shippingCost - row.transactionFees;

    for (const cost of settings.customCosts) {
      if (cost.kind !== "variable") continue;
      if (!customCostActiveOn(cost, row.day)) continue;

      const base =
        cost.basis === "ingresos"
          ? revenue
          : cost.basis === "ventas-brutas"
            ? row.grossSales
            : cost.basis === "beneficio-bruto"
              ? grossProfit
              : row.adSpend;

      const amount = (base * cost.amount) / 100;
      row.customCosts += amount;
      if (cost.inLtvCac) row.acquisitionCosts += amount;
    }
  }

  return [...rows.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Suma de varias filas, con los cuatro derivados ya calculados. */
export function sumRows(rows: DayRow[]): Totals {
  const total = emptyCounters();

  for (const row of rows) {
    total.grossSales += row.grossSales;
    total.discounts += row.discounts;
    total.returns += row.returns;
    total.taxes += row.taxes;
    total.shippingCharged += row.shippingCharged;
    total.tips += row.tips;
    total.orders += row.orders;
    total.unitsSold += row.unitsSold;
    total.newCustomers += row.newCustomers;
    total.cogs += row.cogs;
    total.shippingCost += row.shippingCost;
    total.transactionFees += row.transactionFees;
    total.adSpend += row.adSpend;
    total.customCosts += row.customCosts;
    total.acquisitionCosts += row.acquisitionCosts;
    total.reportedPurchases += row.reportedPurchases;
    total.reportedValue += row.reportedValue;
    total.impressions += row.impressions;
    total.clicks += row.clicks;

    total.adSpendUnconverted += row.adSpendUnconverted;
    if (row.adSpendApprox) total.adSpendApprox = true;

    for (const [provider, amount] of Object.entries(row.adSpendByProvider)) {
      total.adSpendByProvider[provider] = (total.adSpendByProvider[provider] ?? 0) + amount;
    }
  }

  const revenue = revenueOf(total);
  const grossProfit = revenue - total.cogs - total.shippingCost - total.transactionFees;
  const totalCosts =
    total.cogs + total.shippingCost + total.transactionFees + total.adSpend + total.customCosts;

  return {
    ...total,
    revenue,
    grossProfit,
    totalCosts,
    netProfit: revenue - totalCosts,
  };
}

/* ---------------------------- Pedido a pedido ------------------------------ */

export interface OrderBreakdown {
  id: string;
  name: string;
  processedAt: string;
  units: number;
  revenue: number;
  cogs: number;
  shippingCost: number;
  transactionFees: number;
  grossProfit: number;
  /** `null` sin ingresos: un margen del 0% sobre nada no significa nada. */
  grossMargin: number | null;
  gateway: string;
  countryCode: string;
  /** Si al pedido le falta algún coste, para poder marcarlo en la tabla. */
  incomplete: boolean;
}

/**
 * El desglose de un pedido, con los mismos costos que el informe agregado.
 *
 * Existe porque un total que no cuadra solo se puede depurar bajando al pedido:
 * la fila que dice «margen del 98%» es la que tiene la variante sin coste de
 * mercancía puesto. Por eso `incomplete` viaja con cada fila en vez de contarse
 * solo en el agregado.
 *
 * Los costos propios **no** entran aquí. Un sueldo no pertenece a un pedido
 * concreto, y repartirlo entre ellos inventaría una atribución que no existe;
 * por eso esta pestaña enseña beneficio bruto y no neto.
 */
export function orderBreakdown(order: OrderInput, settings: CostSettings): OrderBreakdown {
  let units = 0;
  let cogs = 0;
  let missingCogs = false;

  for (const line of order.lines) {
    const lineUnits = Math.max(0, line.quantity - line.refundedQuantity);
    units += lineUnits;

    const lineCogs = cogsForLine(settings.cogs, line);
    cogs += lineCogs;
    if (lineUnits > 0 && lineCogs === 0) missingCogs = true;
  }

  const zone = zoneFor(settings.shippingZones, order.countryCode);
  const shippingCost = shippingCostFor(zone, units);
  const transactionFees = gatewayFeeFor(settings.gatewayFees, order.gateway, order.total);

  const revenue = revenueOf(order);
  const grossProfit = revenue - cogs - shippingCost - transactionFees;

  return {
    id: order.id,
    name: order.name,
    processedAt: order.processedAt,
    units,
    revenue,
    cogs,
    shippingCost,
    transactionFees,
    grossProfit,
    grossMargin: percent(grossProfit, revenue),
    gateway: order.gateway,
    countryCode: order.countryCode,
    incomplete:
      missingCogs ||
      (units > 0 && zone === null) ||
      (order.total > 0 && transactionFees === 0 && order.gateway !== ""),
  };
}

/* -------------------------------- Derivados ------------------------------- */

/**
 * Las razones se devuelven como `null` cuando no hay denominador, nunca como 0.
 *
 * Un ticket medio de «0 €» y otro de «—» dicen cosas distintas: el primero
 * afirma que la gente compró sin gastar, el segundo que no hubo pedidos. Poner
 * cero donde no hay dato es la forma más rápida de tomar una decisión sobre una
 * cifra que no existe.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function percent(numerator: number, denominator: number): number | null {
  const value = ratio(numerator, denominator);
  return value === null ? null : value * 100;
}

export interface Kpis {
  revenue: number;
  netProfit: number;
  netMargin: number | null;
  roi: number | null;
  grossProfit: number;
  grossSales: number;
  totalCosts: number;
  adSpend: number;
  /** Días de gasto que no se pudieron cambiar de moneda: **no están sumados**. */
  adSpendUnconverted: number;
  /** Si algún día usó un cambio que no era el suyo. */
  adSpendApprox: boolean;
  orders: number;
  unitsSold: number;
  aov: number | null;
  /** ROAS con el dinero cobrado en la tienda, no con lo que declara la red. */
  realRoas: number | null;
  /** ROAS tal y como lo declara la red publicitaria, para poder comparar. */
  reportedRoas: number | null;
  cac: number | null;
  cogs: number;
  shippingCost: number;
  transactionFees: number;
  customCosts: number;
  ctr: number | null;
  cpc: number | null;
}

export function kpis(totals: Totals): Kpis {
  return {
    revenue: totals.revenue,
    netProfit: totals.netProfit,
    netMargin: percent(totals.netProfit, totals.revenue),
    roi: percent(totals.netProfit, totals.totalCosts),
    grossProfit: totals.grossProfit,
    grossSales: totals.grossSales,
    totalCosts: totals.totalCosts,
    adSpend: totals.adSpend,
    adSpendUnconverted: totals.adSpendUnconverted,
    adSpendApprox: totals.adSpendApprox,
    orders: totals.orders,
    unitsSold: totals.unitsSold,
    aov: ratio(totals.revenue, totals.orders),
    realRoas: ratio(totals.revenue, totals.adSpend),
    reportedRoas: ratio(totals.reportedValue, totals.adSpend),
    cac: ratio(totals.adSpend + totals.acquisitionCosts, totals.newCustomers),
    cogs: totals.cogs,
    shippingCost: totals.shippingCost,
    transactionFees: totals.transactionFees,
    customCosts: totals.customCosts,
    ctr: percent(totals.clicks, totals.impressions),
    cpc: ratio(totals.adSpend, totals.clicks),
  };
}

/**
 * Variación respecto al periodo anterior.
 *
 * Devuelve `null` cuando el periodo anterior fue cero, en vez de «+∞%» o
 * «+100%»: pasar de nada a algo no es un porcentaje de crecimiento, y fingir que
 * sí lo es produce esos «+2.400%» que no significan nada.
 */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/* -------------------------------- Agrupado -------------------------------- */

export type Grain = "diario" | "semanal" | "mensual";

/**
 * Agrupa las filas diarias por semana o por mes.
 *
 * Las semanas se cuentan desde el final del rango hacia atrás, no desde el lunes.
 * Es lo que hace que la columna de la izquierda del informe sea siempre «los
 * últimos siete días» en vez de un trozo de semana a medias, que es lo que se
 * quiere comparar cuando se mira a media semana.
 */
export function bucketRows(rows: DayRow[], grain: Grain): { label: string; rows: DayRow[] }[] {
  if (grain === "diario") return rows.map((row) => ({ label: row.day, rows: [row] }));

  if (grain === "mensual") {
    const groups = new Map<string, DayRow[]>();
    for (const row of rows) {
      const key = row.day.slice(0, 7);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([label, group]) => ({ label, rows: group }));
  }

  const buckets: { label: string; rows: DayRow[] }[] = [];
  const reversed = [...rows].reverse();

  for (let index = 0; index < reversed.length; index += 7) {
    const week = reversed.slice(index, index + 7);
    const last = week[0].day;
    const first = week[week.length - 1].day;
    buckets.push({ label: first === last ? first : `${first} – ${last}`, rows: [...week].reverse() });
  }

  return buckets;
}
