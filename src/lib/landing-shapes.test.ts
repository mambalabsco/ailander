import assert from "node:assert/strict";
import { test } from "node:test";

import { LANDING_SHAPES, findShape, nextShape, shapeRules } from "./landing-shapes.ts";

test("una forma que no existe cae en la primera, no revienta", () => {
  assert.equal(findShape("inventada").id, "publirreportaje");
  assert.equal(findShape("carta").id, "carta");
});

test("todas las formas se explican y tienen voz", () => {
  for (const shape of LANDING_SHAPES) {
    assert.ok(shape.label && shape.note && shape.voice, shape.id);
  }
});

/*
 * Lo que una forma **no** lleva es lo que la distingue: una carta personal con
 * ficha de autor y datos con porcentajes ya no es una carta, es otra vez un
 * publirreportaje con otro principio.
 */
test("cada forma con estructura dice también qué no lleva", () => {
  for (const shape of LANDING_SHAPES) {
    if (shape.beats.length === 0) continue;
    assert.ok(shape.avoid.length > 0, shape.id);
  }
});

test("las formas no son la misma con otro nombre", () => {
  const carta = findShape("carta");
  const publi = findShape("publirreportaje");

  assert.notDeepEqual(carta.beats, publi.beats);
  assert.ok(carta.avoid.some((item) => /autor/i.test(item)));
});

/* ------------------------------- El encargo --------------------------------- */

test("el recorrido va numerado y en orden", () => {
  const rules = shapeRules(findShape("diario"));

  assert.match(rules, /1\. Día 1/);
  assert.match(rules, /Lo que esta forma no lleva/);
});

test("la voz entra en el encargo", () => {
  assert.match(shapeRules(findShape("caso")), /Sobrio, sin adjetivos/);
});

/*
 * Cuanto más se le explica cómo tiene que ser una página libre, menos libre es:
 * se acaba describiendo otra plantilla con otras palabras.
 */
test("la libre no impone estructura y es corta", () => {
  const rules = shapeRules(findShape("libre"));

  assert.match(rules, /Decídela tú/);
  assert.ok(!rules.includes("El recorrido, en este orden"));
  assert.ok(rules.length < shapeRules(findShape("publirreportaje")).length);
});

test("la libre pide que explique qué eligió", () => {
  assert.match(shapeRules(findShape("libre")), /qué forma elegiste y por qué/);
});

/* ------------------------------- La rotación -------------------------------- */

/*
 * La segunda página de un producto no debería salir igual que la primera sin
 * tener que acordarse de cambiarlo a mano.
 */
test("se propone una forma que no se haya usado", () => {
  assert.equal(nextShape(["publirreportaje"]).id, "carta");
  assert.equal(nextShape(["publirreportaje", "carta"]).id, "caso");
});

test("con todas usadas se vuelve a empezar en vez de quedarse sin nada", () => {
  const todas = LANDING_SHAPES.map((shape) => shape.id);
  assert.equal(nextShape(todas).id, "publirreportaje");
});

/* La libre no sale sola: se elige a propósito, porque puede salir mal. */
test("la libre no se propone por rotación", () => {
  const casi = LANDING_SHAPES.filter((shape) => shape.id !== "libre").map((shape) => shape.id);
  assert.notEqual(nextShape(casi).id, "libre");
});

test("lo pedido a mano manda sobre la rotación", () => {
  assert.equal(nextShape(["publirreportaje"], "libre").id, "libre");
});
