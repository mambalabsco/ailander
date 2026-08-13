import assert from "node:assert/strict";
import { test } from "node:test";

import { parseReferenceId } from "./reference-id.ts";

/*
 * Este módulo existe porque un prefijo mal leído no da ningún error: escribe una
 * página entera tomando como modelo la equivocada, se paga, y solo se nota
 * leyéndola.
 */

test("sin referencia no hay modelo que buscar", () => {
  assert.deepEqual(parseReferenceId(""), { kind: "ninguna" });
  assert.deepEqual(parseReferenceId("   "), { kind: "ninguna" });
});

test("el plano de una tienda analizada", () => {
  assert.deepEqual(parseReferenceId("plano:abc:portada"), {
    kind: "plano",
    id: "plano:abc:portada",
  });
});

test("una página del propio producto", () => {
  assert.deepEqual(parseReferenceId("landing:9f3"), { kind: "landing", id: "9f3" });
});

test("lo demás es del archivo de copys, como hasta ahora", () => {
  assert.deepEqual(parseReferenceId("swipe-123"), { kind: "archivo", id: "swipe-123" });
});

test("un prefijo a medias no se confunde con el bueno", () => {
  // «landing» sin los dos puntos es un id del archivo que empieza igual, no una
  // página: tomarlo por una página buscaría un id vacío y no encontraría nada.
  assert.deepEqual(parseReferenceId("landingzilla"), { kind: "archivo", id: "landingzilla" });
});

test("un identificador vacío detrás del prefijo no es una página", () => {
  assert.deepEqual(parseReferenceId("landing:"), { kind: "ninguna" });
});
