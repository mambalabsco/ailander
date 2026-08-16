import assert from "node:assert/strict";
import { test } from "node:test";

import { anglesForApp } from "./apps-alcance.ts";

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
