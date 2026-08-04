import assert from "node:assert/strict";
import { test } from "node:test";

import { IMAGE_USD, costLabel, flowCost, nodeCost } from "./cost.ts";
import type { Flow, FlowNode } from "./graph.ts";

const node = (id: string, type: string, settings: Record<string, unknown> = {}): FlowNode => ({
  id,
  type,
  x: 0,
  y: 0,
  settings,
});

const flow = (nodes: FlowNode[]): Flow => ({ nodes, edges: [] });

/* ------------------------------- Nodo a nodo -------------------------------- */

test("una imagen cuesta lo que cuesta una imagen", () => {
  assert.equal(nodeCost(node("imagen-1", "imagen")).usd, IMAGE_USD);
});

test("un clip cuesta según su generador y sus segundos", () => {
  const barato = nodeCost(node("clip-1", "clip", { model: "grok", seconds: 10 }));
  const largo = nodeCost(node("clip-2", "clip", { model: "grok", seconds: 20 }));

  assert.ok(barato.usd !== null && largo.usd !== null);
  assert.ok((largo.usd ?? 0) > (barato.usd ?? 0));
});

/*
 * Un anuncio largo son varias llamadas y se cobran todas. Enseñar el precio de
 * una pieza cuando se van a generar cuatro es el error más caro de la pantalla.
 */
test("un anuncio largo cuenta todos sus tramos", () => {
  const corto = nodeCost(node("a", "anuncio", { model: "grok", seconds: 15 }));
  const largo = nodeCost(node("b", "anuncio", { model: "grok", seconds: 60 }));

  assert.match(largo.what, /tramos/);
  assert.ok((largo.usd ?? 0) > (corto.usd ?? 0) * 2);
});

test("el nombre del nodo dice qué se va a pagar sin abrirlo", () => {
  const cost = nodeCost(node("clip-1", "clip", { model: "grok", seconds: 8 }));

  assert.match(cost.what, /Clip/);
  assert.match(cost.what, /8 s/);
});

/*
 * La tabla solo lleva los precios confirmados: uno inventado es peor que
 * ninguno, porque se decide con él.
 */
test("un generador sin precio publicado da null, no cero", () => {
  assert.equal(nodeCost(node("a", "anuncio", { model: "seedance2", seconds: 10 })).usd, null);
});

test("la voz no se inventa un precio", () => {
  assert.equal(nodeCost(node("voz-1", "voz")).usd, null);
});

test("lo que no llama a nadie no cuesta ni sale en la lista", () => {
  for (const type of ["producto", "avatar", "archivo", "prompt", "referencia"]) {
    assert.equal(nodeCost(node("x", type)).what, "", type);
  }
});

/* -------------------------------- El total ---------------------------------- */

test("se suma lo que se sabe y se cuenta aparte lo que no", () => {
  const cost = flowCost(
    flow([
      node("imagen-1", "imagen"),
      node("imagen-2", "imagen"),
      node("voz-1", "voz"),
      node("producto-1", "producto"),
    ]),
  );

  assert.equal(cost.usd, Number((IMAGE_USD * 2).toFixed(2)));
  assert.equal(cost.unknown, 1);
  assert.equal(cost.steps, 3);
});

/*
 * Continuar con nueve hechos cuesta lo que valen los tres que faltan. Enseñar el
 * total del flujo ahí es mentir hacia arriba — justo el número que hace que
 * alguien no le dé al botón.
 */
test("lo ya hecho no se cuenta", () => {
  const grafo = flow([node("imagen-1", "imagen"), node("imagen-2", "imagen")]);
  const cost = flowCost(grafo, new Set(["imagen-1"]));

  assert.equal(cost.usd, IMAGE_USD);
  assert.equal(cost.steps, 1);
  assert.equal(cost.reused, 1);
});

test("sin nada hecho es el flujo entero", () => {
  const grafo = flow([node("imagen-1", "imagen"), node("imagen-2", "imagen")]);

  assert.equal(flowCost(grafo).steps, 2);
  assert.equal(flowCost(grafo).reused, 0);
});

/* Llenar la lista de ceros esconde los tres nodos que sí cuestan. */
test("los nodos de cero no ensucian la lista", () => {
  const cost = flowCost(flow([node("producto-1", "producto"), node("imagen-1", "imagen")]));

  assert.equal(cost.items.length, 1);
  assert.equal(cost.items[0].nodeId, "imagen-1");
});

test("un flujo vacío no da un total raro", () => {
  const cost = flowCost(flow([]));

  assert.deepEqual({ usd: cost.usd, steps: cost.steps, unknown: cost.unknown }, {
    usd: 0,
    steps: 0,
    unknown: 0,
  });
});

/* --------------------------------- La línea --------------------------------- */

test("se cuenta en una línea con lo que falta", () => {
  const label = costLabel(flowCost(flow([node("imagen-1", "imagen"), node("imagen-2", "imagen")])));

  assert.match(label, /0,04 USD|0\.04 USD/);
  assert.match(label, /2 pasos/);
});

test("lo que no se sabe se dice, no se calla", () => {
  const label = costLabel(flowCost(flow([node("voz-1", "voz")])));
  assert.match(label, /sin precio confirmado/);
});

test("lo reutilizado se nombra: es la razón de que salga tan barato", () => {
  const grafo = flow([node("imagen-1", "imagen"), node("imagen-2", "imagen")]);
  const label = costLabel(flowCost(grafo, new Set(["imagen-1"])));

  assert.match(label, /1 ya hechos no se vuelven a pagar|1 ya hecho/);
});

test("sin nada que generar se dice eso y no «0,00 USD»", () => {
  assert.match(costLabel(flowCost(flow([node("producto-1", "producto")]))), /No queda nada/);
});

test("un paso solo no se pluraliza", () => {
  assert.match(costLabel(flowCost(flow([node("imagen-1", "imagen")]))), /1 paso[^s]/);
});
