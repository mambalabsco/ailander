import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canConnect,
  findNodeType,
  inputsOf,
  NODE_TYPES,
  order,
  readyNow,
  removeNode,
  validate,
  type Flow,
} from "./graph.ts";

const node = (id: string, type: string) => ({ id, type, x: 0, y: 0, settings: {} });

/** Un flujo mínimo que sí se puede ejecutar: producto → guion → anuncio. */
const completo: Flow = {
  nodes: [node("p", "producto"), node("g", "guion"), node("a", "anuncio")],
  edges: [
    { from: "p", to: "g", port: 0 },
    { from: "g", to: "a", port: 0 },
  ],
};

/* ------------------------------ Los tipos ---------------------------------- */

test("cada nodo dice qué hace y qué produce", () => {
  for (const type of NODE_TYPES) {
    assert.ok(type.note.length > 20, `${type.id} sin explicar`);
    assert.ok(type.produces, `${type.id} sin salida`);
  }

  assert.equal(new Set(NODE_TYPES.map((type) => type.id)).size, NODE_TYPES.length);
});

test("los nodos de partida no esperan nada", () => {
  // Si un nodo de fuente pidiera entrada, el flujo no podría empezar nunca.
  for (const type of NODE_TYPES.filter((item) => item.group === "fuente")) {
    assert.deepEqual(type.accepts, [], type.id);
  }
});

test("un tipo desconocido devuelve nada, no el primero", () => {
  assert.equal(findNodeType("inventado"), null);
  assert.ok(findNodeType("guion"));
});

/* ---------------------------- Las conexiones ------------------------------- */

/*
 * Esto es lo que justifica los puertos tipados. Conectar música a la entrada de
 * referencias de un generador de vídeo no da error: se manda un campo que el
 * modelo ignora y sale un vídeo generado sin referencia.
 */
test("no se conecta lo que no encaja", () => {
  const flow: Flow = { nodes: [node("m", "musica"), node("c", "clip")], edges: [] };

  const result = canConnect(flow, "m", "c", 1);

  assert.equal(result.ok, false);
  assert.match(result.why, /audio/);
});

test("lo que encaja sí se conecta", () => {
  const flow: Flow = { nodes: [node("i", "imagen"), node("c", "clip")], edges: [] };

  assert.equal(canConnect(flow, "i", "c", 1).ok, true);
});

test("un nodo no se conecta consigo mismo", () => {
  const flow: Flow = { nodes: [node("c", "clip")], edges: [] };

  assert.equal(canConnect(flow, "c", "c", 1).ok, false);
});

/*
 * Un ciclo no da error al dibujarlo: da un flujo que al ejecutar se queda
 * esperando a un nodo que espera al primero.
 */
test("no se puede cerrar un círculo", () => {
  const flow: Flow = {
    nodes: [node("a", "prompt"), node("b", "imagen"), node("c", "clip")],
    edges: [
      { from: "a", to: "b", port: 0 },
      { from: "b", to: "c", port: 1 },
    ],
  };

  // `clip` produce vídeo y `prompt` acepta texto, así que se prueba con dos que
  // sí encajarían de tipo: imagen → imagen.
  const cerrar = canConnect(
    { ...flow, nodes: [...flow.nodes, node("d", "imagen")] },
    "b",
    "b",
    1,
  );

  assert.equal(cerrar.ok, false);
});

test("una entrada de una sola conexión no acepta dos", () => {
  const flow: Flow = {
    nodes: [node("g1", "guion"), node("g2", "guion"), node("v", "voz")],
    edges: [{ from: "g1", to: "v", port: 0 }],
  };

  const result = canConnect(flow, "g2", "v", 0);

  assert.equal(result.ok, false);
  assert.match(result.why, /solo admite una/);
});

test("una entrada de varias sí acepta varias", () => {
  const flow: Flow = {
    nodes: [node("i1", "imagen"), node("i2", "imagen"), node("c", "clip")],
    edges: [{ from: "i1", to: "c", port: 1 }],
  };

  assert.equal(canConnect(flow, "i2", "c", 1).ok, true);
});

test("la misma conexión no se repite", () => {
  const flow: Flow = {
    nodes: [node("i", "imagen"), node("c", "clip")],
    edges: [{ from: "i", to: "c", port: 1 }],
  };

  assert.equal(canConnect(flow, "i", "c", 1).ok, false);
});

test("una entrada que no existe se rechaza", () => {
  const flow: Flow = { nodes: [node("i", "imagen"), node("c", "clip")], edges: [] };

  assert.equal(canConnect(flow, "i", "c", 9).ok, false);
});

/* ----------------------------- La validación ------------------------------- */

test("un flujo completo no tiene problemas", () => {
  assert.deepEqual(validate(completo), []);
});

test("dice qué falta, y todo lo que falta de una vez", () => {
  // De uno en uno serían cinco vueltas para lo que se ve de golpe.
  const flow: Flow = { nodes: [node("g", "guion"), node("v", "voz")], edges: [] };

  const problems = validate(flow);

  assert.equal(problems.length, 2);
  assert.ok(problems.some((problem) => problem.nodeId === "g"));
  assert.ok(problems.some((problem) => problem.nodeId === "v"));
});

test("lo opcional que falta no es un problema", () => {
  // El guion acepta un copy de referencia y funciona igual sin él.
  const problems = validate(completo);

  assert.equal(problems.some((problem) => problem.problem.includes("referencia")), false);
});

test("un tipo inventado se señala en vez de ignorarse", () => {
  const flow: Flow = { nodes: [node("x", "inventado")], edges: [] };

  assert.match(validate(flow)[0].problem, /no es un tipo/);
});

/* ------------------------------- El orden ---------------------------------- */

test("cada nodo va después de los que le dan entrada", () => {
  const result = order(completo)!;

  assert.ok(result.indexOf("p") < result.indexOf("g"));
  assert.ok(result.indexOf("g") < result.indexOf("a"));
});

test("un ciclo no tiene orden, y se dice devolviendo nada", () => {
  // No es un orden malo: es que no existe ninguno.
  const flow: Flow = {
    nodes: [node("a", "imagen"), node("b", "imagen")],
    edges: [
      { from: "a", to: "b", port: 1 },
      { from: "b", to: "a", port: 1 },
    ],
  };

  assert.equal(order(flow), null);
  assert.ok(validate(flow).some((problem) => problem.problem.includes("círculo")));
});

test("un flujo vacío tiene un orden vacío, no un fallo", () => {
  assert.deepEqual(order({ nodes: [], edges: [] }), []);
});

/* ---------------------------- Lo que puede correr -------------------------- */

/*
 * Es lo que permite lanzar en paralelo lo que no depende entre sí: en una tanda
 * de veinte, la diferencia entre dos minutos y veinte.
 */
test("al empezar, solo los de partida", () => {
  assert.deepEqual(readyNow(completo, new Set()), ["p"]);
});

test("con uno hecho, el siguiente ya puede", () => {
  assert.deepEqual(readyNow(completo, new Set(["p"])), ["g"]);
});

test("dos ramas independientes salen a la vez", () => {
  const flow: Flow = {
    nodes: [node("p1", "prompt"), node("p2", "prompt"), node("i1", "imagen"), node("i2", "imagen")],
    edges: [
      { from: "p1", to: "i1", port: 0 },
      { from: "p2", to: "i2", port: 0 },
    ],
  };

  assert.deepEqual(readyNow(flow, new Set()), ["p1", "p2"]);
  assert.deepEqual(readyNow(flow, new Set(["p1", "p2"])), ["i1", "i2"]);
});

test("lo hecho no vuelve a salir", () => {
  assert.equal(readyNow(completo, new Set(["p", "g", "a"])).length, 0);
});

/* ------------------------------- Lo demás ---------------------------------- */

test("las entradas se agrupan por puerto", () => {
  const flow: Flow = {
    nodes: [node("i1", "imagen"), node("i2", "imagen"), node("t", "prompt"), node("c", "clip")],
    edges: [
      { from: "t", to: "c", port: 0 },
      { from: "i1", to: "c", port: 1 },
      { from: "i2", to: "c", port: 1 },
    ],
  };

  const inputs = inputsOf(flow, "c");

  assert.deepEqual(inputs.get(0), ["t"]);
  assert.deepEqual(inputs.get(1), ["i1", "i2"]);
});

test("quitar un nodo se lleva sus conexiones", () => {
  // Sin esto quedan conexiones apuntando a un nodo que no existe, y el orden las
  // cuenta como dependencias que nunca se cumplen.
  const next = removeNode(completo, "g");

  assert.equal(next.nodes.length, 2);
  assert.deepEqual(next.edges, []);
  assert.ok(order(next));
});
