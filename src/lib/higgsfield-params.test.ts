import assert from "node:assert/strict";
import { test } from "node:test";
import { costLabel, creditsFrom, creditsToUsd, declaredDurations } from "./higgsfield-params.ts";

test("encuentra las duraciones esté donde esté el parámetro", () => {
  // Tres formas plausibles del mismo dato: la clave puede mudarse de sitio y el
  // objetivo es que siga encontrándose, no acertar la ruta de hoy.
  const enOptions = { params: { duration: { options: [5, 10] } } };
  const enLista = { parameters: [{ name: "duration", enum: [5, 10] }] };
  const suelto = { schema: { properties: { duration_seconds: { default: 5, examples: [10] } } } };

  assert.deepEqual(declaredDurations(enOptions), [5, 10]);
  assert.deepEqual(declaredDurations(enLista), [5, 10]);
  assert.deepEqual(declaredDurations(suelto), [5, 10]);
});

test("un modelo sin duración devuelve vacío, no un cero", () => {
  // Vacío se enseña como campo libre; un [0] pintaría una opción de cero segundos.
  assert.deepEqual(declaredDurations({ params: { prompt: { type: "string" } } }), []);
  assert.deepEqual(declaredDurations(null), []);
});

test("descarta lo que no puede ser segundos de vídeo", () => {
  const raro = { params: { duration: { options: [0, -3, 5000, 8] } } };

  assert.deepEqual(declaredDurations(raro), [8]);
});

test("el nombre del parámetro no se cuenta como valor", () => {
  const conNombre = { params: [{ name: "duration", title: "5", options: [7] }] };

  assert.deepEqual(declaredDurations(conNombre), [7]);
});

test("no se atasca con referencias cruzadas", () => {
  const ciclo: Record<string, unknown> = { params: { duration: { options: [6] } } };
  ciclo.self = ciclo;

  assert.deepEqual(declaredDurations(ciclo), [6]);
});

test("los créditos exactos mandan sobre los redondeados", () => {
  assert.equal(creditsFrom({ credits: 12, credits_exact: 12.5 }), 12.5);
  assert.equal(creditsFrom({ credits: 12 }), 12);
});

test("los créditos se encuentran aunque vengan envueltos", () => {
  assert.equal(creditsFrom({ data: { credits: 9 } }), 9);
  assert.equal(creditsFrom({ result: { cost: { credits_exact: 4.25 } } }), 4.25);
});

test("sin créditos devuelve null, no cero", () => {
  // Un cero se enseñaría como «gratis», que es la respuesta más cara posible.
  assert.equal(creditsFrom({ status: "ok" }), null);
  assert.equal(creditsFrom("nada"), null);
});

test("sin tarifa configurada no hay dólares inventados", () => {
  assert.equal(creditsToUsd(20, null), null);
  assert.equal(creditsToUsd(20, 0), null);
  assert.equal(creditsToUsd(null, 0.01), null);
});

test("con tarifa, los dólares salen", () => {
  assert.equal(creditsToUsd(20, 0.01), 0.2);
});

test("la línea dice lo que falta en vez de callarlo", () => {
  assert.match(costLabel(null, null), /no dio el coste/);
  assert.match(costLabel(20, null), /HIGGSFIELD_USD_PER_CREDIT/);
  assert.match(costLabel(20, 0.2), /0\.20 USD/);
  assert.match(costLabel(1, 0.01), /1 crédito\b/);
});
