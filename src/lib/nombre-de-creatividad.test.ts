import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdImageName, siguienteSecuencia } from "./nombre-de-creatividad.ts";

const AD = "Ad48_Beneficios_Todo_Lo_Que_Cambia_En_8_Semanas";

test("el nombre es el del anuncio más el correlativo a dos dígitos", () => {
  assert.equal(buildAdImageName({ adName: AD, sequence: 1 }), `${AD}_01`);
  assert.equal(buildAdImageName({ adName: AD, sequence: 12 }), `${AD}_12`);
});

test("pasado el 99 crece en vez de recortarse", () => {
  // Recortar daría `_00` para la 100, que se confunde con la primera.
  assert.equal(buildAdImageName({ adName: AD, sequence: 100 }), `${AD}_100`);
});

test("el nombre del anuncio entra tal cual, sin pasar por slugify", () => {
  /*
   * Es la razón de ser de este módulo. El nombre de imagen de siempre pone todo
   * en minúsculas y con guiones, y así el archivo dejaba de parecerse al
   * anuncio que hay que escribir en el gestor.
   */
  const nombre = buildAdImageName({ adName: AD, sequence: 3 });
  assert.ok(nombre.startsWith(AD), `«${nombre}» debería empezar por «${AD}»`);
  assert.ok(!nombre.includes("-"), "no debería llevar guiones");
});

test("un nombre de anuncio con espacios o acentos se normaliza", () => {
  // No debería llegar así —`buildAdName` ya limpia— pero un anuncio editado a
  // mano sí puede, y un espacio en el nombre de archivo rompe la descarga.
  assert.equal(buildAdImageName({ adName: "Ad9 Diseño Ñu", sequence: 1 }), "Ad9_Diseno_Nu_01");
});

test("el siguiente correlativo sale del máximo, no de la cuenta", () => {
  // Es el fallo de hoy visto de frente: con `count`, descartar una imagen hace
  // retroceder el contador y dos archivos acaban llamándose igual.
  assert.equal(siguienteSecuencia(null), 1);
  assert.equal(siguienteSecuencia(3), 4);
  assert.equal(siguienteSecuencia(7), 8);
});
