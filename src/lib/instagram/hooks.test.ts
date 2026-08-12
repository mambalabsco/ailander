import assert from "node:assert/strict";
import { test } from "node:test";

import { ARCHETYPES, buildHookGuide, findFiller, pickArchetypes } from "./hooks.ts";

test("las fórmulas se reparten sin repetir hasta agotarlas", () => {
  /*
   * Un modelo al que se le pide «un gancho potente» escribe la media de lo que
   * ha visto y repite la misma forma diez veces. Repartiendo, cada publicación
   * tiene que rellenar una distinta — y ahí aparece lo específico.
   */
  const cinco = pickArchetypes(5);

  assert.equal(new Set(cinco.map((one) => one.id)).size, 5);

  // Y dos tandas seguidas no empiezan por la misma.
  assert.notEqual(pickArchetypes(3, 0)[0].id, pickArchetypes(3, 3)[0].id);
});

test("cada fórmula dice cuándo funciona", () => {
  // Sin eso se usan todas para todo, y una fórmula usada donde no toca es peor
  // que ninguna: obliga a forzar el texto para que encaje.
  for (const one of ARCHETYPES) {
    assert.ok(one.when.length > 20, `${one.id} no dice cuándo se usa`);
    assert.ok(one.shape.includes("{") || one.shape.includes("¿"), `${one.id} no tiene huecos`);
  }
});

test("el relleno se señala, no se borra", () => {
  /*
   * Quitando «increíble» de «un resultado increíble» queda «un resultado», que
   * no dice más. Lo que hay que hacer es reescribir la frase, y eso lo decide
   * quien escribe: aquí solo se marca.
   */
  assert.deepEqual(findFiller("Un resultado increíble, esto lo cambia todo"), [
    "increíble",
    "esto lo cambia todo",
  ]);

  assert.deepEqual(findFiller("Tres gotas antes de dormir. Duermes de un tirón."), []);
});

test("la guía dice que la fórmula no es el gancho", () => {
  const guia = buildHookGuide(pickArchetypes(3));

  assert.ok(guia.includes("una distinta"));
  assert.ok(guia.includes("no es el gancho"), "la fórmula obliga a decir algo, no lo dice");
  assert.ok(guia.includes("revolucionario"), "y el relleno que hay que evitar");
});

test("sin fórmulas no se manda una sección vacía", () => {
  assert.equal(buildHookGuide([]), "");
});
