import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attributeOrders,
  attributionCoverage,
  landingPerformance,
  type AttributableCampaign,
  type AttributableOrder,
} from "./attribution.ts";

function order(values: Partial<AttributableOrder> = {}): AttributableOrder {
  return {
    id: "o1",
    total: 100,
    landingPage: "/pages/dr-revela",
    utm: {},
    isFirstOrder: true,
    ...values,
  };
}

function campaign(values: Partial<AttributableCampaign> = {}): AttributableCampaign {
  return {
    provider: "facebook",
    accountName: "USA-7",
    campaignRef: "120210",
    campaignName: "CL141026_USA7_NTRX",
    spend: 50,
    impressions: 1000,
    clicks: 20,
    reportedPurchases: 2,
    reportedValue: 200,
    currency: "USD",
    ...values,
  };
}

test("empareja por nombre de campaña, sin distinguir mayúsculas", () => {
  const result = attributeOrders(
    [order({ utm: { campaign: "cl141026_usa7_ntrx" } })],
    [campaign()],
  );

  assert.equal(result.campaigns[0].orders, 1);
  assert.equal(result.campaigns[0].revenue, 100);
  assert.equal(result.unattributed.orders, 0);
});

test("empareja también por identificador, para quien usa {{campaign.id}}", () => {
  const result = attributeOrders([order({ utm: { campaign: "120210" } })], [campaign()]);

  assert.equal(result.campaigns[0].orders, 1);
});

test("una coincidencia parcial NO cuenta", () => {
  /*
   * El caso real: `220326_EN_US_TEST` es subcadena de `220326_EN_US_TESTCREPEY`.
   * Emparejar por subcadena asignaría las ventas de una campaña a otra sin que
   * nada avisara, que es el peor error posible en esta tabla.
   */
  const result = attributeOrders(
    [order({ utm: { campaign: "220326_EN_US_TEST" } })],
    [campaign({ campaignName: "220326_EN_US_TESTCREPEY" })],
  );

  assert.equal(result.campaigns[0].orders, 0);
  assert.equal(result.unattributed.orders, 1);
});

test("los pedidos sin UTM van a su grupo, no se reparten", () => {
  const result = attributeOrders(
    [
      order({ id: "a", utm: { campaign: "CL141026_USA7_NTRX" }, total: 100 }),
      order({ id: "b", utm: {}, total: 300 }),
      order({ id: "c", utm: { source: "facebook" }, total: 50 }),
    ],
    [campaign()],
  );

  assert.equal(result.campaigns[0].orders, 1);
  assert.equal(result.campaigns[0].revenue, 100);
  assert.equal(result.unattributed.orders, 2);
  assert.equal(result.unattributed.revenue, 350);
});

test("el ROAS real usa el dinero de la tienda, no lo que declara la red", () => {
  const result = attributeOrders(
    [order({ utm: { campaign: "CL141026_USA7_NTRX" }, total: 100 })],
    // La red declara 200 de valor; la tienda cobró 100.
    [campaign({ spend: 50, reportedValue: 200 })],
  );

  assert.equal(result.campaigns[0].realRoas, 2);
  assert.equal(result.campaigns[0].reportedValue, 200);
  assert.equal(result.campaigns[0].contribution, 50);
});

test("una campaña con gasto y sin ventas sale con ROAS cero, no nulo", () => {
  const result = attributeOrders([], [campaign({ spend: 80 })]);

  assert.equal(result.campaigns[0].realRoas, 0);
  assert.equal(result.campaigns[0].contribution, -80);
});

test("una campaña sin gasto no tiene ROAS", () => {
  const result = attributeOrders([], [campaign({ spend: 0 })]);

  assert.equal(result.campaigns[0].realRoas, null);
  assert.equal(result.campaigns[0].cac, null);
});

test("las campañas se ordenan por gasto, para ver primero dónde se va el dinero", () => {
  const result = attributeOrders(
    [],
    [
      campaign({ campaignRef: "1", campaignName: "poca", spend: 10 }),
      campaign({ campaignRef: "2", campaignName: "mucha", spend: 500 }),
      campaign({ campaignRef: "3", campaignName: "media", spend: 100 }),
    ],
  );

  assert.deepEqual(
    result.campaigns.map((item) => item.campaignName),
    ["mucha", "media", "poca"],
  );
});

test("el coste por cliente nuevo solo cuenta las primeras compras", () => {
  const result = attributeOrders(
    [
      order({ id: "a", utm: { campaign: "CL141026_USA7_NTRX" }, isFirstOrder: true }),
      order({ id: "b", utm: { campaign: "CL141026_USA7_NTRX" }, isFirstOrder: false }),
    ],
    [campaign({ spend: 60 })],
  );

  assert.equal(result.campaigns[0].orders, 2);
  assert.equal(result.campaigns[0].newCustomers, 1);
  assert.equal(result.campaigns[0].cac, 60);
});

/* --------------------------------- Landings -------------------------------- */

test("agrupa por página y ordena por ingresos", () => {
  const rows = landingPerformance([
    order({ id: "a", landingPage: "/pages/a", total: 50 }),
    order({ id: "b", landingPage: "/pages/b", total: 300 }),
    order({ id: "c", landingPage: "/pages/a", total: 70 }),
  ]);

  assert.equal(rows[0].landingPage, "/pages/b");
  assert.equal(rows[1].landingPage, "/pages/a");
  assert.equal(rows[1].orders, 2);
  assert.equal(rows[1].revenue, 120);
  assert.equal(rows[1].aov, 60);
});

test("los pedidos sin página registrada se agrupan con nombre propio", () => {
  const rows = landingPerformance([order({ landingPage: "" })]);

  assert.equal(rows[0].landingPage, "(sin página registrada)");
});

/* -------------------------------- Cobertura -------------------------------- */

test("la cobertura dice qué parte del negocio se sabe de dónde viene", () => {
  const rows = [
    order({ id: "a", utm: { campaign: "x" } }),
    order({ id: "b", utm: { campaign: "y" } }),
    order({ id: "c", utm: {} }),
    order({ id: "d", utm: {} }),
  ];

  assert.equal(attributionCoverage(rows), 50);
  // Sin pedidos no hay cobertura del 0%, no hay cobertura.
  assert.equal(attributionCoverage([]), null);
});
