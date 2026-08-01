import assert from "node:assert/strict";
import { test } from "node:test";
import { takeForRole, type ReferenceSection } from "./page-sections.ts";

function seccion(role: string, type: string): ReferenceSection {
  return { role, type, html: "", css: "", palette: null, images: 0, fonts: [], imageUrls: [] };
}

test("primero se busca por papel", () => {
  const pool = [seccion("beneficios", "icons"), seccion("faq", "faq")];

  assert.equal(takeForRole(pool, "faq")?.type, "faq");
  assert.equal(pool.length, 1);
});

/*
 * Con la portada real de la referencia, cinco de doce secciones se llaman
 * `slider`, `standards`, `clinically`, `percents` y `beats`. Ninguno de esos
 * nombres dice qué hace, así que ninguno emparejaba por papel.
 */
test("sin coincidencia de papel se coge la siguiente sin usar", () => {
  const pool = [seccion("otra", "standards"), seccion("otra", "clinically")];

  assert.equal(takeForRole(pool, "comparativa")?.type, "standards");
  assert.equal(takeForRole(pool, "mecanismo")?.type, "clinically");
  assert.equal(takeForRole(pool, "oferta"), null);
});

test("la cabecera y el pie no se reparten como comodín", () => {
  // Pasarle el marcado de un menú a una comparativa es peor que no darle nada.
  const pool = [seccion("cabecera", "header"), seccion("pie", "footer")];

  assert.equal(takeForRole(pool, "comparativa"), null);
  assert.equal(pool.length, 2, "siguen ahí para quien sí las pida");
});

test("una que ya se usó no vuelve a salir", () => {
  const pool = [seccion("faq", "faq1"), seccion("faq", "faq2")];

  assert.equal(takeForRole(pool, "faq")?.type, "faq1");
  assert.equal(takeForRole(pool, "faq")?.type, "faq2");
  assert.equal(takeForRole(pool, "faq"), null);
});
