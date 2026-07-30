import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bucketRows,
  cogsForLine,
  dailyRows,
  dayKey,
  daysBetween,
  gatewayFeeFor,
  kpis,
  shippingCostFor,
  spreadFixedCost,
  sumRows,
  zoneFor,
  type CostSettings,
  type CustomCost,
  type DayRow,
  type OrderInput,
} from "./profit.ts";

/**
 * Pruebas del motor de beneficio.
 *
 * `npm test` las ejecuta. No necesitan servidor, base de datos ni credenciales,
 * que es justo el motivo de que `profit.ts` no importe nada.
 *
 * La primera prueba es la más importante de todo el archivo: comprueba las
 * fórmulas contra las **cifras reales** de la herramienta con la que el usuario
 * compara sus números. Si alguien cambia una definición por otra que suena más
 * correcta, esta prueba falla y ahí se ve.
 */

/* Vacía menos lo que cada prueba ponga. */
function row(values: Partial<DayRow> = {}): DayRow {
  return {
    day: "2026-07-29",
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
    customCosts: 0,
    acquisitionCosts: 0,
    reportedPurchases: 0,
    reportedValue: 0,
    impressions: 0,
    clicks: 0,
    ...values,
  };
}

function settings(values: Partial<CostSettings> = {}): CostSettings {
  return {
    cogs: [],
    shippingZones: [],
    gatewayFees: [],
    customCosts: [],
    timeZone: "America/Mexico_City",
    currency: "USD",
    ...values,
  };
}

const cent = (value: number) => Math.round(value * 100) / 100;

/* ---------------------- Las fórmulas, contra datos reales ------------------ */

test("cuadra al céntimo con el informe semanal real de TrueProfit", () => {
  // Semana del 23 al 29 de julio de 2026, tienda Naturox, en dólares.
  const totals = sumRows([
    row({
      grossSales: 7077.73,
      discounts: 2526.69,
      returns: 19.2,
      taxes: 830.77,
      shippingCharged: 0,
      cogs: 935.26,
      shippingCost: 637.93,
      transactionFees: 278.08,
      adSpend: 3200.61,
      customCosts: 0,
    }),
  ]);

  assert.equal(cent(totals.revenue), 5362.61);
  assert.equal(cent(totals.totalCosts), 5051.88);
  assert.equal(cent(totals.netProfit), 310.73);
});

test("cuadra con la segunda semana, que tiene otras proporciones", () => {
  const totals = sumRows([
    row({
      grossSales: 8482.75,
      discounts: 3439.94,
      returns: 30.39,
      taxes: 965.1,
      cogs: 1076.96,
      shippingCost: 778.28,
      transactionFees: 320.12,
      adSpend: 2937.53,
    }),
  ]);

  assert.equal(cent(totals.revenue), 5977.52);
  assert.equal(cent(totals.totalCosts), 5112.89);
});

test("los derivados del panel salen de los mismos totales", () => {
  // Cifras del panel de «hoy»: 8 pedidos, 16 unidades.
  const totals = sumRows([
    row({
      grossSales: 406.41,
      // Ajustado para llegar a los 368,80 de ingresos publicados.
      discounts: 37.61,
      orders: 8,
      unitsSold: 16,
      newCustomers: 8,
      cogs: 52.63,
      shippingCost: 51.03,
      transactionFees: 18.6,
      adSpend: 217.46,
    }),
  ]);

  const result = kpis(totals);

  assert.equal(cent(result.revenue), 368.8);
  assert.equal(cent(result.totalCosts), 339.72);
  assert.equal(cent(result.netProfit), 29.08);
  assert.equal(cent(result.grossProfit), 246.54);
  assert.equal(cent(result.netMargin ?? 0), 7.89);
  assert.equal(cent(result.roi ?? 0), 8.56);
  assert.equal(cent(result.aov ?? 0), 46.1);
});

test("las razones sin denominador son nulas, no cero", () => {
  const result = kpis(sumRows([row()]));

  // Sin pedidos no hay ticket medio; sin gasto no hay ROAS. Decir «0» aquí
  // afirmaría algo falso sobre el negocio.
  assert.equal(result.aov, null);
  assert.equal(result.realRoas, null);
  assert.equal(result.netMargin, null);
  assert.equal(result.cac, null);
});

/* ------------------------------- Zona horaria ------------------------------ */

test("un pedido de última hora es del día de la tienda, no del de UTC", () => {
  // 05:30 UTC del 29 son las 23:30 del 28 en Ciudad de México (UTC−6).
  assert.equal(dayKey("2026-07-29T05:30:00Z", "America/Mexico_City"), "2026-07-28");
  // Y las 01:30 del 29 en Santiago (UTC−4 en invierno austral).
  assert.equal(dayKey("2026-07-29T05:30:00Z", "America/Santiago"), "2026-07-29");
  assert.equal(dayKey("2026-07-29T05:30:00Z", "UTC"), "2026-07-29");
});

test("una zona horaria inválida no tira el informe", () => {
  assert.equal(dayKey("2026-07-29T10:00:00Z", "No/Existe"), "2026-07-29");
});

test("un rango al revés no devuelve días", () => {
  assert.deepEqual(daysBetween("2026-07-10", "2026-07-01"), []);
  assert.equal(daysBetween("2026-07-01", "2026-07-31").length, 31);
});

/* --------------------------- Coste de mercancía --------------------------- */

test("la regla de la variante gana a la del producto", () => {
  const rules = [
    { productRef: "p1", variantRef: "", amount: 5 },
    { productRef: "p1", variantRef: "v-pack3", amount: 11 },
  ];

  const line = {
    productRef: "p1",
    variantRef: "v-pack3",
    sku: "",
    title: "Pack de 3",
    quantity: 2,
    unitPrice: 0,
    discount: 0,
    refundedQuantity: 0,
  };

  assert.equal(cogsForLine(rules, line), 22);
  assert.equal(cogsForLine(rules, { ...line, variantRef: "v-otra" }), 10);
});

test("la mercancía devuelta no se cobra", () => {
  const rules = [{ productRef: "p1", variantRef: "", amount: 5 }];
  const line = {
    productRef: "p1",
    variantRef: "",
    sku: "",
    title: "Bote",
    quantity: 3,
    unitPrice: 0,
    discount: 0,
    refundedQuantity: 3,
  };

  assert.equal(cogsForLine(rules, line), 0);
  assert.equal(cogsForLine(rules, { ...line, refundedQuantity: 1 }), 10);
});

test("una línea sin regla vale cero y no revienta", () => {
  assert.equal(
    cogsForLine([], {
      productRef: "",
      variantRef: "",
      sku: "",
      title: "",
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      refundedQuantity: 0,
    }),
    0,
  );
});

/* -------------------------------- Envío ----------------------------------- */

const zones = [
  { name: "Default", countries: [], isDefault: true, tiers: [{ qty: 1, cost: 5.03 }] },
  {
    name: "mex",
    countries: ["MX"],
    isDefault: false,
    // Los tramos reales de la cuenta del usuario.
    tiers: [
      { qty: 1, cost: 5.75 },
      { qty: 2, cost: 8.68 },
      { qty: 3, cost: 11.6 },
      { qty: 4, cost: 14.53 },
      { qty: 5, cost: 17.45 },
      { qty: 6, cost: 20.42 },
    ],
  },
];

test("el país gana a la zona por defecto", () => {
  assert.equal(zoneFor(zones, "MX")?.name, "mex");
  assert.equal(zoneFor(zones, "mx")?.name, "mex");
  assert.equal(zoneFor(zones, "CL")?.name, "Default");
});

test("se aplica el tramo mayor que no pasa de la cantidad", () => {
  const mex = zoneFor(zones, "MX");

  assert.equal(shippingCostFor(mex, 1), 5.75);
  assert.equal(shippingCostFor(mex, 3), 11.6);
  // Por encima del último tramo declarado se mantiene ese, no se extrapola.
  assert.equal(shippingCostFor(mex, 40), 20.42);
  assert.equal(shippingCostFor(mex, 0), 0);
});

test("sin zona ni tramos el envío es cero", () => {
  assert.equal(shippingCostFor(null, 3), 0);
  assert.equal(shippingCostFor({ name: "x", countries: [], isDefault: true, tiers: [] }, 3), 0);
});

/* ------------------------------- Comisiones -------------------------------- */

test("la comisión es porcentaje más fijo, y un pedido de cero no la paga", () => {
  const fees = [{ gateway: "manual", percent: 2.9, fixed: 0.3 }];

  assert.equal(cent(gatewayFeeFor(fees, "manual", 100)), 3.2);
  assert.equal(cent(gatewayFeeFor(fees, "Manual", 100)), 3.2);
  assert.equal(gatewayFeeFor(fees, "manual", 0), 0);
  assert.equal(gatewayFeeFor(fees, "shopify_payments", 100), 0);
});

/* ---------------------------- Costos propios ------------------------------ */

function custom(values: Partial<CustomCost> = {}): CustomCost {
  return {
    id: "c1",
    name: "Sueldo",
    kind: "fijo",
    amount: 3100,
    basis: "ingresos",
    category: "",
    startsOn: "2026-07-01",
    endsOn: "2026-07-31",
    repeat: "ninguno",
    inLtvCac: false,
    ...values,
  };
}

test("un costo fijo se reparte entre los días de su ventana", () => {
  const perDay = spreadFixedCost(custom());

  assert.equal(perDay.size, 31);
  assert.equal(cent(perDay.get("2026-07-15") ?? 0), 100);
  // El total repartido es el importe, sin pérdidas por redondeo.
  assert.equal(cent([...perDay.values()].reduce((sum, value) => sum + value, 0)), 3100);
});

test("un costo mensual que arranca el 31 no se salta febrero", () => {
  const perDay = spreadFixedCost(
    custom({ amount: 100, startsOn: "2026-01-31", endsOn: "2026-03-30", repeat: "mensual" }),
  );

  // Tres ventanas: 31 ene–27 feb, 28 feb–27 mar, 28–30 mar.
  assert.ok((perDay.get("2026-02-15") ?? 0) > 0, "febrero debe tener su parte");
  assert.ok((perDay.get("2026-03-15") ?? 0) > 0, "marzo también");
  assert.equal(perDay.get("2026-03-31"), undefined, "y nada después de la fecha de fin");
});

test("un costo variable se calcula sobre la base de su día", () => {
  const order: OrderInput = {
    id: "o1",
    name: "#1",
    processedAt: "2026-07-15T15:00:00Z",
    currency: "USD",
    grossSales: 1000,
    discounts: 0,
    returns: 0,
    taxes: 0,
    shippingCharged: 0,
    tips: 0,
    total: 1000,
    gateway: "manual",
    test: false,
    isFirstOrder: true,
    countryCode: "MX",
    lines: [],
  };

  const rows = dailyRows({
    orders: [order],
    spend: [],
    settings: settings({
      customCosts: [
        custom({ kind: "variable", amount: 10, basis: "ingresos", name: "Socio" }),
      ],
    }),
    from: "2026-07-15",
    to: "2026-07-15",
  });

  assert.equal(cent(rows[0].customCosts), 100);
});

test("un costo variable fuera de su ventana no se aplica", () => {
  const rows = dailyRows({
    orders: [],
    spend: [{ provider: "facebook", day: "2026-08-05", campaignName: "x", spend: 500, impressions: 0, clicks: 0, reportedPurchases: 0, reportedValue: 0 }],
    settings: settings({
      customCosts: [
        custom({ kind: "variable", amount: 10, basis: "gasto-publicitario", endsOn: "2026-07-31" }),
      ],
    }),
    from: "2026-08-05",
    to: "2026-08-05",
  });

  assert.equal(rows[0].customCosts, 0);
});

/* -------------------------------- El cálculo ------------------------------- */

test("un pedido de prueba no entra en ningún informe", () => {
  const base: OrderInput = {
    id: "o1",
    name: "#1",
    processedAt: "2026-07-15T15:00:00Z",
    currency: "USD",
    grossSales: 500,
    discounts: 0,
    returns: 0,
    taxes: 0,
    shippingCharged: 0,
    tips: 0,
    total: 500,
    gateway: "manual",
    test: true,
    isFirstOrder: true,
    countryCode: "MX",
    lines: [],
  };

  const rows = dailyRows({
    orders: [base],
    spend: [],
    settings: settings(),
    from: "2026-07-15",
    to: "2026-07-15",
  });

  assert.equal(rows[0].orders, 0);
  assert.equal(rows[0].grossSales, 0);
});

test("los días sin ventas salen con ceros, no se saltan", () => {
  const rows = dailyRows({
    orders: [],
    spend: [],
    settings: settings(),
    from: "2026-07-01",
    to: "2026-07-10",
  });

  assert.equal(rows.length, 10);
  assert.equal(rows[0].day, "2026-07-01");
  assert.equal(rows[9].day, "2026-07-10");
});

test("un pedido completo pasa por mercancía, envío y comisión", () => {
  const order: OrderInput = {
    id: "o1",
    name: "#NT2739",
    processedAt: "2026-07-29T15:00:00Z",
    currency: "USD",
    grossSales: 90,
    discounts: 13.03,
    returns: 0,
    taxes: 0,
    shippingCharged: 0,
    tips: 0,
    total: 76.97,
    gateway: "manual",
    test: false,
    isFirstOrder: true,
    countryCode: "MX",
    lines: [
      {
        productRef: "p1",
        variantRef: "v2",
        sku: "NTX-2",
        title: "Naturox x2",
        quantity: 2,
        unitPrice: 45,
        discount: 13.03,
        refundedQuantity: 0,
      },
    ],
  };

  const rows = dailyRows({
    orders: [order],
    spend: [
      {
        provider: "facebook",
        day: "2026-07-29",
        campaignName: "CL141026_USA7_NTRX",
        spend: 40,
        impressions: 1000,
        clicks: 25,
        reportedPurchases: 1,
        reportedValue: 76.97,
      },
    ],
    settings: settings({
      cogs: [{ productRef: "p1", variantRef: "v2", amount: 8.15 }],
      shippingZones: zones,
      gatewayFees: [{ gateway: "manual", percent: 2.9, fixed: 0.3 }],
    }),
    from: "2026-07-29",
    to: "2026-07-29",
  });

  const totals = sumRows(rows);

  assert.equal(totals.orders, 1);
  assert.equal(totals.unitsSold, 2);
  assert.equal(cent(totals.cogs), 16.3);
  assert.equal(cent(totals.shippingCost), 8.68);
  assert.equal(cent(totals.transactionFees), 2.53);
  assert.equal(cent(totals.revenue), 76.97);
  assert.equal(cent(totals.adSpend), 40);
  assert.equal(totals.adSpendByProvider.facebook, 40);
  assert.equal(cent(totals.netProfit), 9.46);

  const result = kpis(totals);
  assert.equal(cent(result.realRoas ?? 0), 1.92);
  assert.equal(cent(result.ctr ?? 0), 2.5);
  assert.equal(cent(result.cac ?? 0), 40);
});

test("el gasto de un día fuera del rango se ignora", () => {
  const rows = dailyRows({
    orders: [],
    spend: [
      { provider: "facebook", day: "2026-06-01", campaignName: "vieja", spend: 999, impressions: 0, clicks: 0, reportedPurchases: 0, reportedValue: 0 },
    ],
    settings: settings(),
    from: "2026-07-01",
    to: "2026-07-02",
  });

  assert.equal(sumRows(rows).adSpend, 0);
});

/* -------------------------------- Agrupado -------------------------------- */

test("las semanas se cuentan desde el final del rango", () => {
  const rows = dailyRows({
    orders: [],
    spend: [],
    settings: settings(),
    from: "2026-07-20",
    to: "2026-07-29",
  });

  const weeks = bucketRows(rows, "semanal");

  assert.equal(weeks.length, 2);
  // La primera columna es siempre «los últimos siete días».
  assert.equal(weeks[0].label, "2026-07-23 – 2026-07-29");
  assert.equal(weeks[1].label, "2026-07-20 – 2026-07-22");
});

test("el agrupado mensual usa la clave año-mes", () => {
  const rows = dailyRows({
    orders: [],
    spend: [],
    settings: settings(),
    from: "2026-06-28",
    to: "2026-07-02",
  });

  const months = bucketRows(rows, "mensual");

  assert.deepEqual(
    months.map((bucket) => bucket.label),
    ["2026-06", "2026-07"],
  );
});
