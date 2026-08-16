import assert from "node:assert/strict";
import { test } from "node:test";

import { NIVELES, copyLevelRule } from "./nivel-de-copia.ts";

const OWNERSHIPS = ["propio", "ajeno"] as const;

test("de lo ajeno, ningún nivel deja heredar cifras", () => {
  // Es la esquina peligrosa: «mismo enfoque» sobre un anuncio de otra marca es
  // afirmar aquí lo que nadie ha comprobado aquí. No falla si se salta: sale un
  // anuncio con un dato que nadie puede sostener.
  for (const nivel of NIVELES) {
    assert.match(
      copyLevelRule(nivel.id, "ajeno"),
      /no atribuyas/i,
      `el nivel ${nivel.id} sobre material ajeno no lleva la prohibición`,
    );
  }
});

test("de lo propio, ningún nivel la lleva", () => {
  for (const nivel of NIVELES) {
    assert.ok(
      !/no atribuyas/i.test(copyLevelRule(nivel.id, "propio")),
      `el nivel ${nivel.id} sobre material propio prohíbe lo que sí está comprobado`,
    );
  }
});

test("las seis combinaciones son distintas", () => {
  // Si dos coinciden, uno de los dos mandos no está haciendo nada y la pantalla
  // ofrece una elección que no existe.
  const vistas = new Set<string>();

  for (const nivel of NIVELES) {
    for (const ownership of OWNERSHIPS) {
      vistas.add(copyLevelRule(nivel.id, ownership));
    }
  }

  assert.equal(vistas.size, NIVELES.length * OWNERSHIPS.length);
});

test("cada nivel dice lo suyo", () => {
  assert.match(copyLevelRule("mismo", "propio"), /misma promesa/i);
  assert.match(copyLevelRule("ampliado", "propio"), /entradas nuevas/i);
  assert.match(copyLevelRule("referencia", "propio"), /investigación/i);
});

test("son tres niveles y cada uno se puede enseñar en pantalla", () => {
  assert.equal(NIVELES.length, 3);

  for (const nivel of NIVELES) {
    assert.ok(nivel.nombre.length > 0);
    assert.ok(nivel.explicacion.length > 0);
  }
});
