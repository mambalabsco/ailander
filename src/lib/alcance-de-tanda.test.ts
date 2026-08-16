import assert from "node:assert/strict";
import { test } from "node:test";

import { batchScopeRule } from "./alcance-de-tanda.ts";

test("el embudo completo pide varios conjuntos y varias etapas", () => {
  const regla = batchScopeRule({ alcance: "embudo", stage: "BOFU", count: 10 });

  assert.match(regla, /dos a cuatro conjuntos/i);
  assert.match(regla, /TOFU/);
  assert.match(regla, /MOFU/);
});

test("una sola etapa pide un solo conjunto, y lo dice sin ambigüedad", () => {
  // El fallo que evita: el encargo pedía «de tres a cinco anuncios por conjunto»
  // y «los N anuncios» a la vez. Con un solo conjunto la contradicción se ve, y
  // por eso aquí el número va dicho una vez y en total.
  const regla = batchScopeRule({ alcance: "etapa", stage: "BOFU", count: 7 });

  assert.match(regla, /un solo conjunto|un único conjunto/i);
  assert.ok(!/dos a cuatro/i.test(regla));
});

test("en las dos, el total de anuncios es el que se pidió", () => {
  for (const alcance of ["embudo", "etapa"] as const) {
    assert.match(
      batchScopeRule({ alcance, stage: "TOFU", count: 12 }),
      /12/,
      `el alcance ${alcance} no dice cuántos anuncios en total`,
    );
  }
});

test("la etapa elegida aparece, y significa cosas distintas en cada alcance", () => {
  // En embudo es por dónde entra; en etapa es la única que hay. Si el texto no
  // lo distingue, el modelo trata la etapa de entrada como la única.
  assert.match(batchScopeRule({ alcance: "embudo", stage: "MOFU", count: 5 }), /entrada/i);
  assert.match(batchScopeRule({ alcance: "etapa", stage: "MOFU", count: 5 }), /MOFU/);
});
