import assert from "node:assert/strict";
import { test } from "node:test";

import { RESEARCH_DOCUMENT_META, documentsFor } from "./research.ts";

test("e-commerce ve exactamente los seis de siempre", () => {
  // Es la prueba que protege todo lo que ya funciona: si esta se rompe, a un
  // producto de suplementos le ha aparecido un documento de casino.
  assert.deepEqual(documentsFor("ecommerce"), [
    "awareness",
    "competitors",
    "avatars",
    "master",
    "desire-extraction",
    "desire-validation",
  ]);
});

test("casino ve los seis y los tres suyos", () => {
  const ids = documentsFor("casino");

  assert.equal(ids.length, 9);
  for (const id of documentsFor("ecommerce")) {
    assert.ok(ids.includes(id), `casino perdió el documento ${id}`);
  }
});

test("los de casino no se cuelan en e-commerce", () => {
  for (const id of ["regulation", "payments", "casino-landscape"] as const) {
    assert.ok(
      !documentsFor("ecommerce").includes(id),
      `${id} le aparece a un producto de e-commerce`,
    );
  }
});

test("cada documento de la lista viene ordenado por su orden", () => {
  // La pantalla los pinta en este orden y las dependencias lo asumen: uno que
  // dependa de otro no puede salir antes.
  for (const vertical of ["ecommerce", "casino"] as const) {
    const orders = documentsFor(vertical).map((id) => RESEARCH_DOCUMENT_META[id].order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b), `desordenado en ${vertical}`);
  }
});

test("todo documento de la lista depende solo de documentos de su lista", () => {
  // Una dependencia hacia fuera del vertical deja el documento bloqueado para
  // siempre: espera a otro que en esa pantalla no existe y no da ningún error.
  for (const vertical of ["ecommerce", "casino"] as const) {
    const ids = documentsFor(vertical);
    for (const id of ids) {
      for (const need of RESEARCH_DOCUMENT_META[id].dependsOn) {
        assert.ok(ids.includes(need), `${id} depende de ${need}, que no está en ${vertical}`);
      }
    }
  }
});
