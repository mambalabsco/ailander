import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NEVER_CARRIED,
  houseRules,
  readFidelity,
  referenceImages,
  referenceRules,
} from "./landing-fidelity.ts";

test("por defecto se calca, que es a lo que se trae una referencia", () => {
  assert.equal(readFidelity(undefined), "calcado");
  assert.equal(readFidelity(""), "calcado");
  assert.equal(readFidelity("inspirado"), "inspirado");
});

/*
 * Calcar es reutilizar el texto. «Con el mismo espíritu» es escribir otra
 * página, y entonces la referencia no servía de nada.
 */
test("calcar pide reutilizar el texto frase por frase", () => {
  const rules = referenceRules("calcado");

  assert.match(rules, /reutiliza su texto/);
  assert.match(rules, /frase por frase/);
});

test("calcar conserva el formato del original, no el de la casa", () => {
  assert.match(referenceRules("calcado"), /No lo conviertas\n\s*al formato de siempre/);
});

test("inspirarse pide justo lo contrario", () => {
  const rules = referenceRules("inspirado");

  assert.match(rules, /página nueva/);
  assert.ok(!rules.includes("frase por frase"));
});

test("calcando se dice qué es lo único que cambia", () => {
  const rules = referenceRules("calcado");

  assert.match(rules, /nombre del producto/);
  assert.match(rules, /cifras, los estudios/);
});

/* Traer una landing de otro país es el caso normal, no la excepción. */
test("calcando se traduce, no se resume", () => {
  const rules = referenceRules("calcado");

  assert.match(rules, /Tradúcela/);
  assert.match(rules, /no la resumas/);
});

/* ----------------------------- Las reglas de casa --------------------------- */

/*
 * Aquí estaba el fallo: se pedía calcar y a la vez se imponían la longitud, el
 * reparto de secciones y el surtido de la casa. El modelo obedece las reglas
 * escritas en números y sale otra vez la misma página de siempre.
 */
test("calcando no se mandan las reglas de la casa", () => {
  assert.equal(houseRules("calcado", true), "");
});

test("sin referencia sí se mandan, aunque el modo sea calcado", () => {
  // Sin nada que calcar, calcar no significa nada y la página se escribe de cero.
  assert.match(houseRules("calcado", false), /1\.100 y 1\.500/);
});

test("inspirándose se mandan siempre", () => {
  assert.match(houseRules("inspirado", true), /Usa la variedad/);
  assert.match(houseRules("inspirado", false), /Usa la variedad/);
});

test("las reglas de la casa llevan lo que sostiene una landing larga", () => {
  const rules = houseRules("inspirado", true);

  assert.match(rules, /no aparece en el primer tercio/);
  assert.match(rules, /Tres llamadas a la acción/);
});

/* ------------------------------- Lo que nunca --------------------------------- */

test("lo que no se arrastra no depende del modo", () => {
  assert.match(NEVER_CARRIED, /ni cifras de resultados/);
  assert.match(NEVER_CARRIED, /devuelve el pedido/);
});

/* -------------------------------- Las imágenes ------------------------------ */

/*
 * Sin decir dónde iban, una página calcada acaba con la foto del producto donde
 * el original tenía el diagrama que explica el mecanismo.
 */
test("las imágenes de la referencia se listan con su sitio", () => {
  const block = referenceImages(["https://a/1.jpg", "https://a/2.jpg"]);

  assert.match(block, /Tenía 2/);
  assert.match(block, /1\. https:\/\/a\/1\.jpg/);
  assert.match(block, /diagrama del mecanismo/);
});

test("sin imágenes no queda una sección vacía", () => {
  assert.equal(referenceImages([]), "");
});

test("no se manda un listado infinito", () => {
  const block = referenceImages(Array.from({ length: 30 }, (_, i) => `https://a/${i}.jpg`));

  assert.ok(block.includes("https://a/11.jpg"));
  assert.ok(!block.includes("https://a/12.jpg"));
});
