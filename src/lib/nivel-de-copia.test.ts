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

test("ni siquiera de lo ajeno se tira el tema del anuncio", () => {
  /*
   * El fallo del 16 de agosto, y por qué existe este test.
   *
   * La regla decía «reutiliza **solo su construcción**», y el modelo hizo caso:
   * tiró el ángulo del material —colesterol, evitar la estatina— y rellenó con
   * lo único que le quedaba, la investigación del producto. Salió una tanda
   * sobre cansancio a partir de un anuncio sobre colesterol.
   *
   * Lo que se prohíbe de un material ajeno es **afirmar sus cifras como
   * nuestras**, no pensar con su idea. Es la distinción de la spec: el ángulo
   * puede ir tan lejos como haga falta; la frase que se publica, no.
   */
  for (const nivel of NIVELES) {
    const regla = copyLevelRule(nivel.id, "ajeno");

    assert.ok(
      !/solo su construcción|solo la construcción/i.test(regla),
      `el nivel ${nivel.id} sobre ajeno reduce el material a su forma y tira la idea`,
    );
    assert.match(
      regla,
      /tema|ángulo|idea/i,
      `el nivel ${nivel.id} sobre ajeno no dice que la idea del anuncio se conserva`,
    );
  }
});

test("lo que se prohíbe es afirmar, no pensar", () => {
  // Las dos mitades tienen que estar en la misma regla: qué se conserva y qué no
  // se puede decir. Con una sola, o se pierde el ángulo o se cuela una cifra.
  const regla = copyLevelRule("mismo", "ajeno");

  assert.match(regla, /cifra/i);
  assert.match(regla, /no atribuyas/i);
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
  assert.match(copyLevelRule("mismo", "propio"), /no busques un ángulo nuevo/i);
  assert.match(copyLevelRule("ampliado", "propio"), /entradas nuevas/i);
  assert.match(copyLevelRule("referencia", "propio"), /cómo está construido/i);
});

test("los tres niveles conservan el tema, y en eso no se diferencian", () => {
  // Lo que separa los niveles es cuánto se aleja la **ejecución**, no si se
  // habla de otra cosa. Un nivel que cambia de tema no es un nivel: es otro
  // anuncio, y para eso no hacía falta darle un material.
  for (const nivel of NIVELES) {
    assert.match(copyLevelRule(nivel.id, "propio"), /tema|idea de fondo/i);
  }
});

test("son tres niveles y cada uno se puede enseñar en pantalla", () => {
  assert.equal(NIVELES.length, 3);

  for (const nivel of NIVELES) {
    assert.ok(nivel.nombre.length > 0);
    assert.ok(nivel.explicacion.length > 0);
  }
});
