import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGenerationPrompt,
  buildSpecPrompt,
  dedupe,
  looksLikeDuplicate,
  shouldGenerate,
  type ImageSpec,
} from "./image-spec.ts";

function spec(values: Partial<ImageSpec> = {}): ImageSpec {
  return {
    sourceUrl: "https://tienda.com/hero.jpg",
    role: "heroe",
    angle: "tres-cuartos",
    light: "natural-suave",
    background: "mármol blanco",
    props: ["hojas de eucalipto", "cápsulas sueltas"],
    composition: "el producto a la izquierda, aire a la derecha",
    palette: "blancos y verdes apagados",
    hasText: false,
    ...values,
  };
}

/* -------------------------- Lo que no se describe -------------------------- */

test("al leer la referencia se prohíbe describir la marca y el envase", () => {
  /*
   * No es una precaución escrita por encima. Si el modelo describe «el bote azul
   * con la etiqueta dorada», ese texto acaba dentro del prompt de generación y
   * el resultado sale pareciéndose al envase de otro — que es justo lo que hay
   * que evitar, porque tu producto tiene el suyo.
   */
  const prompt = buildSpecPrompt("heroe");

  assert.match(prompt, /NO debes describir/);
  assert.match(prompt, /La marca, el envase o la etiqueta/);
  assert.match(prompt, /No lo transcribas|no lo transcribas/);
});

test("el prompt lleva el papel de la imagen, para no describir a ciegas", () => {
  assert.ok(buildSpecPrompt("comparativa").includes("comparativa"));
});

/* --------------------------- El prompt que genera -------------------------- */

test("el envase va por referencia, nunca descrito", () => {
  /*
   * Un envase descrito con palabras sale inventado, y un envase inventado en un
   * anuncio de respuesta directa es una devolución: el cliente recibe algo que
   * no se parece a lo que vio.
   */
  const prompt = buildGenerationPrompt(spec(), "Naturox");

  assert.match(prompt, /EXACTAMENTE el de la imagen de referencia/);
  assert.ok(prompt.includes("Naturox"));
});

test("la receta entera viaja al prompt", () => {
  const prompt = buildGenerationPrompt(spec(), "Naturox");

  assert.ok(prompt.includes("tres cuartos"));
  assert.ok(prompt.includes("natural suave"));
  assert.ok(prompt.includes("mármol blanco"));
  assert.ok(prompt.includes("hojas de eucalipto"));
  assert.ok(prompt.includes("blancos y verdes apagados"));
});

test("el texto se prohíbe siempre, aunque la referencia lo tuviera", () => {
  // Los modelos escriben letras inventadas en cuanto se les deja, y un envase
  // con texto deforme es peor que uno sin nada.
  const prompt = buildGenerationPrompt(spec({ hasText: true }), "Naturox");

  assert.match(prompt, /NO: texto de ningún tipo/);
});

test("una receta con campos vacíos no deja frases sueltas", () => {
  const prompt = buildGenerationPrompt(
    spec({ background: "", props: [], composition: "", palette: "" }),
    "Naturox",
  );

  assert.ok(!prompt.includes("Fondo: ."));
  assert.ok(!prompt.includes("En la escena: ."));
  assert.ok(prompt.includes("Naturox"));
});

/* ------------------------- Generar o componer ------------------------------ */

test("una imagen con texto se compone, no se genera", () => {
  /*
   * Una comparativa o una tabla de precios sale mejor montada con HTML: el texto
   * queda legible y seleccionable, se corrige sin pagar otra generación y no sale
   * con letras inventadas.
   */
  const verdict = shouldGenerate(spec({ hasText: true }));

  assert.equal(verdict.generate, false);
  assert.match(verdict.reason, /HTML/);
});

test("una escena sin texto sí se genera", () => {
  assert.equal(shouldGenerate(spec()).generate, true);
});

/* --------------------------- Recetas repetidas ----------------------------- */

test("el mismo montaje con otro ángulo no es un duplicado", () => {
  /*
   * Cambiar de ángulo **es** la variación que aporta. Si contara como duplicado
   * se perdería justo la imagen que añade algo.
   */
  assert.equal(looksLikeDuplicate(spec(), spec({ angle: "cenital" })), false);
});

test("el mismo montaje con otro fondo tampoco", () => {
  assert.equal(looksLikeDuplicate(spec(), spec({ background: "madera clara" })), false);
});

test("dos recetas idénticas sí, aunque vengan de imágenes distintas", () => {
  // Una tienda repite el mismo montaje varias veces; generar una por cada una
  // gasta sin añadir variedad.
  assert.equal(
    looksLikeDuplicate(spec({ sourceUrl: "a.jpg" }), spec({ sourceUrl: "b.jpg" })),
    true,
  );
});

test("dedupe conserva la primera de cada montaje", () => {
  const specs = [
    spec({ sourceUrl: "1.jpg" }),
    spec({ sourceUrl: "2.jpg" }),
    spec({ sourceUrl: "3.jpg", background: "madera clara" }),
  ];

  const kept = dedupe(specs);

  assert.equal(kept.length, 2);
  assert.equal(kept[0].sourceUrl, "1.jpg");
  assert.equal(kept[1].sourceUrl, "3.jpg");
});

test("una lista vacía no rompe nada", () => {
  assert.deepEqual(dedupe([]), []);
});
