import assert from "node:assert/strict";
import { test } from "node:test";

import { anglesForApp, patternsFor } from "./apps-alcance.ts";

const generales = [{ id: "g1", appId: undefined }];
const deApp = [{ id: "a1", appId: "app-1" }];

test("un ángulo general se ofrece para cualquier app", () => {
  // Es la mitad del valor de que `app_id` sea nulable: una historia sirve para
  // varias apps, y obligar a elegir una duplicaría el trabajo desde el día uno.
  assert.deepEqual(
    anglesForApp([...generales, ...deApp], "app-2").map((item) => item.id),
    ["g1"],
  );
});

test("el de una app se ofrece con los generales, solo en la suya", () => {
  assert.deepEqual(
    anglesForApp([...generales, ...deApp], "app-1").map((item) => item.id),
    ["g1", "a1"],
  );
});

test("sin app elegida se ven todos, que es la lista completa del producto", () => {
  assert.equal(anglesForApp([...generales, ...deApp], "").length, 2);
});

test("el orden de entrada se respeta", () => {
  // La lista llega ordenada por fecha desde la base; reordenar aquí haría que la
  // pantalla enseñe un orden distinto del que dice la consulta.
  const lista = [
    { id: "a1", appId: "app-1" },
    { id: "g1", appId: undefined },
    { id: "a2", appId: "app-1" },
  ];

  assert.deepEqual(
    anglesForApp(lista, "app-1").map((item) => item.id),
    ["a1", "g1", "a2"],
  );
});

test("en casino no se ofrece un packshot ni los ingredientes", () => {
  /*
   * Los patrones de imagen son de un producto físico: un frasco recortado, la
   * textura en macro, los ingredientes alrededor. En un casino no hay envase que
   * fotografiar, y ofrecerlos no da error: se genera un frasco inventado y se
   * paga por él.
   */
  const casino = patternsFor("casino");

  for (const fuera of ["packshot-principal", "packshot-angulo", "detalle-textura", "composicion-ingredientes", "escala-en-mano", "pack-oferta"]) {
    assert.ok(!casino.includes(fuera), `${fuera} no debería ofrecerse en casino`);
  }
});

test("en casino sí se ofrecen las de la app y las que no dependen del envase", () => {
  const casino = patternsFor("casino");

  assert.ok(casino.includes("app-en-movil"));
  assert.ok(casino.includes("app-en-mano"));
  // La tarjeta de reseñas funciona igual en casino: no enseña ningún envase.
  assert.ok(casino.includes("resena-estrellas"));
});

test("en e-commerce se ofrece lo de siempre y nada de apps", () => {
  const ecom = patternsFor("ecommerce");

  assert.ok(ecom.includes("packshot-principal"));
  for (const fuera of ["captura-app", "app-en-movil", "app-en-mano"]) {
    assert.ok(!ecom.includes(fuera), `${fuera} no debería ofrecerse en e-commerce`);
  }
});

test("la captura no se ofrece en ninguno: se sube, no se genera", () => {
  for (const vertical of ["ecommerce", "casino"] as const) {
    assert.ok(!patternsFor(vertical).includes("captura-app"));
  }
});
