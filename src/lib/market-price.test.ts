import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canPublish,
  commercialRounding,
  isStale,
  priceLine,
  resolvePrice,
} from "./market-price.ts";
import type { MarketPrice } from "./market-price.ts";

const manual: MarketPrice = {
  marketId: "cl",
  price: 9990,
  source: "manual",
  fxDay: null,
  fxRate: null,
};

const convertido: MarketPrice = {
  marketId: "mx",
  price: 10847,
  source: "convertido",
  fxDay: "2026-07-01",
  fxRate: 18.2,
};

const vacio: MarketPrice = {
  marketId: "pe",
  price: null,
  source: "ninguno",
  fxDay: null,
  fxRate: null,
};

/* ------------------------------ La cascada ---------------------------------- */

test("en general no hay precio, aunque los mercados tengan uno", () => {
  assert.equal(resolvePrice({ kind: "general" }, [manual, convertido]), null);
});

test("el precio escrito a mano es el que sale", () => {
  const found = resolvePrice({ kind: "market", marketId: "cl" }, [manual, convertido]);

  assert.deepEqual(found, { amount: 9990, source: "manual" });
});

test("el convertido sale, pero diciendo que es convertido", () => {
  const found = resolvePrice({ kind: "market", marketId: "mx" }, [manual, convertido]);

  assert.deepEqual(found, { amount: 10847, source: "convertido" });
});

test("un mercado sin precio no inventa el de otro mercado", () => {
  assert.equal(resolvePrice({ kind: "market", marketId: "pe" }, [manual, vacio]), null);
});

test("un mercado que no está en la lista no hereda nada", () => {
  assert.equal(resolvePrice({ kind: "market", marketId: "co" }, [manual]), null);
});

/* --------------------------- Qué se puede publicar --------------------------- */

test("solo lo escrito a mano se publica", () => {
  assert.equal(canPublish({ amount: 9990, source: "manual" }), true);
  assert.equal(canPublish({ amount: 10847, source: "convertido" }), false);
  assert.equal(canPublish(null), false);
});

/* ------------------------------- El redondeo -------------------------------- */

test("en pesos se propone la terminación 990", () => {
  assert.equal(commercialRounding(10847, "CLP"), 10990);
  assert.equal(commercialRounding(10847, "COP"), 10990);
});

test("en euros y dólares se propone la terminación ,99", () => {
  assert.equal(commercialRounding(48.4, "EUR"), 48.99);
  assert.equal(commercialRounding(48.4, "USD"), 48.99);
});

test("una moneda sin regla no propone nada, en vez de inventarse una", () => {
  assert.equal(commercialRounding(1234, "JPY"), null);
});

test("no propone el mismo número que ya hay: sería un botón que no hace nada", () => {
  assert.equal(commercialRounding(10990, "CLP"), null);
});

/* ------------------------------- La caducidad ------------------------------- */

test("una conversión de hace más de un mes se marca vieja", () => {
  assert.equal(isStale("2026-07-01", "2026-08-12"), true);
  assert.equal(isStale("2026-08-01", "2026-08-12"), false);
});

test("sin día de cambio no hay nada que caducar", () => {
  assert.equal(isStale(null, "2026-08-12"), false);
});

/* ------------------------- La línea de los encargos -------------------------- */

test("sin precio, la línea del encargo desaparece entera", () => {
  assert.equal(priceLine("Precio", null, "CLP"), "");
});

test("con precio, la línea lleva el importe y la moneda", () => {
  assert.equal(priceLine("Precio", { amount: 9990, source: "manual" }, "CLP"), "Precio: 9990 CLP");
});
