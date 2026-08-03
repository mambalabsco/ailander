import assert from "node:assert/strict";
import { test } from "node:test";

import { ASPECTS, aspectsFor, findAspect, nearestAspect, pixels } from "./aspect.ts";

test("la vertical sale primero: es la forma de un anuncio", () => {
  assert.equal(ASPECTS[0].id, "9:16");
});

test("las medidas cuadran con el nombre", () => {
  for (const aspect of ASPECTS) {
    const [w, h] = aspect.id.split(":").map(Number);

    assert.ok(
      Math.abs(aspect.width / aspect.height - w / h) < 0.02,
      `${aspect.id} mide ${aspect.width}×${aspect.height}`,
    );
  }
});

test("sin lista declarada solo se ofrecen las tres universales", () => {
  // Ofrecer una que el modelo no entiende no da error: devuelve su forma por
  // defecto y el vídeo sale con otra proporción sin avisar.
  assert.deepEqual(
    aspectsFor([]).map((aspect) => aspect.id),
    ["9:16", "1:1", "16:9"],
  );
});

test("con lista declarada se ofrecen exactamente esas", () => {
  assert.deepEqual(
    aspectsFor(["9:16", "4:5"]).map((aspect) => aspect.id),
    ["9:16", "4:5"],
  );
});

test("al cambiar de generador se cae en la más parecida", () => {
  // Entre vertical y apaisada, 4:5 es vertical sin discusión.
  assert.equal(nearestAspect("4:5", ["9:16", "16:9"]), "9:16");
  assert.equal(nearestAspect("4:3", ["9:16", "16:9"]), "16:9");
});

test("con el cuadrado disponible, 4:5 se queda en cuadrado", () => {
  /*
   * Sorprende y es correcto: 4:5 está a 0,22 del cuadrado y a 0,35 de la
   * vertical. Un 9:16 es mucho más alargado de lo que parece, y encajar ahí un
   * 4:5 recorta más que dejarlo cuadrado.
   */
  assert.equal(nearestAspect("4:5", ["9:16", "1:1", "16:9"]), "1:1");
});

test("tumbar una proporción cuesta lo mismo en los dos sentidos", () => {
  // Lo que da la medida logarítmica: 4:3 y 3:4 quedan igual de lejos del cuadrado.
  assert.equal(nearestAspect("3:4", ["1:1"]), "1:1");
  assert.equal(nearestAspect("4:3", ["1:1"]), "1:1");
});

test("si ya está admitida no se cambia", () => {
  assert.equal(nearestAspect("1:1", ["9:16", "1:1", "16:9"]), "1:1");
});

test("una desconocida no revienta", () => {
  assert.equal(findAspect("99:1").id, "9:16");
});

test("las medidas se pueden enseñar al lado del nombre", () => {
  assert.equal(pixels("9:16"), "720 × 1280");
  assert.equal(pixels("16:9"), "1280 × 720");
});

test("cada proporción dice para qué sirve", () => {
  for (const aspect of ASPECTS) {
    assert.ok(aspect.note.length > 4, `${aspect.id} sin explicar`);
  }
});
