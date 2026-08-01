import assert from "node:assert/strict";
import { test } from "node:test";
import { bestMatch, similarity, tokens } from "./product-match.ts";

test("los acentos y el ruido no cuentan", () => {
  assert.deepEqual(tokens("Cápsulas de Colágeno Marino"), ["colageno", "marino"]);
  assert.deepEqual(tokens("60 mg"), []);
});

test("un nombre largo con el corto dentro es el mismo producto", () => {
  // Dividir entre las palabras del largo lo hundiría a la mitad.
  const score = similarity("Lymphatic Drainage", "Lymphatic Drainage — 60 cápsulas, envío gratis");

  assert.equal(score, 1);
});

test("dos productos distintos no se parecen", () => {
  assert.ok(similarity("Lymphatic Drainage", "Colágeno Marino") < 0.5);
});

const TIENDA = [
  { title: "Colágeno Marino Premium" },
  { title: "Lymphatic Drainage" },
  { title: "Magnesio Bisglicinato" },
];

test("encuentra el suyo entre varios", () => {
  assert.equal(bestMatch("Lymphatic Drainage 60 caps", TIENDA)?.title, "Lymphatic Drainage");
});

test("y prefiere no poner ninguno antes que el equivocado", () => {
  // En un suplemento el bote es el producto: una página con el frasco de otro la
  // corrige el cliente cuando abre el paquete.
  assert.equal(bestMatch("Ashwagandha KSM-66", TIENDA), null);
});

test("una tienda vacía no revienta", () => {
  assert.equal(bestMatch("lo que sea", []), null);
});

test("un nombre sin palabras útiles no empareja con nada", () => {
  assert.equal(bestMatch("de la", TIENDA), null);
});
