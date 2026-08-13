import assert from "node:assert/strict";
import { test } from "node:test";

import { inheritanceRule } from "./material-herencia.ts";

test("de lo propio se puede heredar la promesa y sus cifras", () => {
  const rule = inheritanceRule("propio");

  assert.match(rule, /comprobad/i);
  assert.ok(!/no atribuyas/i.test(rule));
});

test("de lo ajeno, solo la construcción", () => {
  // Es la regla que impide que una cifra de otro anuncio acabe dicha como
  // nuestra. No falla si se salta: sale un copy con un dato que nadie comprobó,
  // dicho con la misma seguridad que los nuestros.
  const rule = inheritanceRule("ajeno");

  assert.match(rule, /no atribuyas/i);
  assert.match(rule, /construcción/i);
});

test("las dos reglas son distintas, o la distinción no sirve de nada", () => {
  assert.notEqual(inheritanceRule("propio"), inheritanceRule("ajeno"));
});
