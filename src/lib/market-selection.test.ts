import assert from "node:assert/strict";
import { test } from "node:test";

import {
  marketLines,
  parseSelection,
  showSelector,
  stampFor,
  visibleIn,
} from "./market-selection.ts";

/* ------------------------------ El selector --------------------------------- */

test("con un solo mercado no hay selector y siempre se está en él", () => {
  assert.equal(showSelector(["cl"]), false);
  assert.deepEqual(parseSelection(undefined, ["cl"]), { kind: "market", marketId: "cl" });
});

test("con un solo mercado, pedir general no lleva a general", () => {
  // La función no existe todavía para ese producto: dejarla entrar enseñaría una
  // ficha sin precio a quien no ha pedido varios mercados.
  assert.deepEqual(parseSelection("general", ["cl"]), { kind: "market", marketId: "cl" });
});

test("con varios mercados se empieza en general", () => {
  assert.equal(showSelector(["cl", "mx"]), true);
  assert.deepEqual(parseSelection(undefined, ["cl", "mx"]), { kind: "general" });
});

test("se puede elegir un mercado concreto", () => {
  assert.deepEqual(parseSelection("mx", ["cl", "mx"]), { kind: "market", marketId: "mx" });
});

test("un mercado que ya no existe cae a general, no a otro país", () => {
  // Se borra un mercado y queda un enlace viejo. Caer al primero de la lista
  // enseñaría el precio de Chile bajo el nombre de México.
  assert.deepEqual(parseSelection("borrado", ["cl", "mx"]), { kind: "general" });
});

test("sin mercados, general", () => {
  assert.equal(showSelector([]), false);
  assert.deepEqual(parseSelection("mx", []), { kind: "general" });
});

/* -------------------------------- El filtro --------------------------------- */

test("en general solo se ve lo general", () => {
  assert.equal(visibleIn({ kind: "general" }, null), true);
  assert.equal(visibleIn({ kind: "general" }, "mx"), false);
});

test("en un mercado se ve lo suyo y lo general", () => {
  const mx = { kind: "market", marketId: "mx" } as const;

  assert.equal(visibleIn(mx, "mx"), true);
  assert.equal(visibleIn(mx, null), true);
  assert.equal(visibleIn(mx, "cl"), false);
});

/* --------------------------- El sello al generar ---------------------------- */

test("lo generado en general se guarda sin mercado", () => {
  assert.equal(stampFor({ kind: "general" }), null);
});

test("lo generado en un mercado se guarda con su mercado", () => {
  assert.equal(stampFor({ kind: "market", marketId: "mx" }), "mx");
});

/* ------------------- El país y el idioma de los encargos --------------------- */

const mexico = { countryName: "México", languageName: "Español" };

test("en un mercado, el encargo lleva su país y su idioma", () => {
  assert.deepEqual(marketLines({ kind: "market", marketId: "mx" }, mexico, "Español"), [
    "País: México",
    "Idioma de salida: Español",
  ]);
});

test("en general no hay país, y se dice que no lo nombre", () => {
  // No basta con callarlo: sin instrucción, el modelo se inventa un país al
  // escribir —«aquí en Chile»— y el texto deja de valer para los demás.
  assert.deepEqual(marketLines({ kind: "general" }, null, "Español"), [
    "País: varios (NO nombres ningún país, ciudad ni moneda: este texto vale para todos)",
    "Idioma de salida: Español",
  ]);
});
