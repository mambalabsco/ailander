import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySectionTexts,
  buildClonePrompt,
  buildSlotPrompt,
  collectSectionTexts,
  readAdapted,
} from "./landing-clone.ts";
import type { LandingSection } from "../types/landing.ts";

const PORTADA = [
  { kind: "titular", text: "Adelgaza sin pasar hambre" },
  { kind: "crudo", html: "<p>marcado entero</p>", css: ".x{}" },
  { kind: "lista", items: ["Menos hinchazón", "Mejor descanso"] },
  { kind: "dato", value: "93 mil clientas", text: "Ya somos" },
  {
    kind: "comparativa",
    left: { title: "Lo de siempre", items: ["Caro", "Lento"] },
    right: { title: "Con el producto", items: ["Barato", "Rápido"] },
  },
] as unknown as LandingSection[];

test("se recogen los textos de todas las formas de sección", () => {
  const paths = collectSectionTexts(PORTADA).map((one) => one.path);

  assert.ok(paths.includes("0.text"));
  assert.ok(paths.includes("2.items.0"));
  assert.ok(paths.includes("2.items.1"));
  assert.ok(paths.includes("3.value"));
  assert.ok(paths.includes("4.left.title"));
  assert.ok(paths.includes("4.right.items.1"));

  /*
   * La sección `crudo` se queda fuera: su contenido es marcado entero y se
   * adapta por el camino de las páginas copiadas, que sabe respetar las
   * etiquetas. Mezclarlo aquí devolvería HTML dentro de un campo de texto.
   */
  assert.ok(!paths.some((path) => path.startsWith("1.")));
});

test("el tipo de sección viaja con el texto", () => {
  // Sin él, «Ya somos» es una frase suelta y el modelo no sabe que encabeza una
  // cifra grande — la reescribe como si fuera un párrafo.
  const dato = collectSectionTexts(PORTADA).find((one) => one.path === "3.value");

  assert.equal(dato?.kind, "dato");
});

test("adaptar un texto no toca ningún otro campo", () => {
  const next = applySectionTexts(PORTADA, {
    "0.text": "Duerme de un tirón",
    "4.right.items.0": "Cómodo",
  });

  assert.equal(next[0].text, "Duerme de un tirón");
  assert.equal(next[4].right?.items[0], "Cómodo");
  assert.equal(next[4].right?.items[1], "Rápido", "lo que no cambia llega intacto");
  assert.equal(next[1].html, "<p>marcado entero</p>", "el crudo no se toca");

  // Y el original no se modifica: de una portada se sacan varias, y una que se
  // altera al clonarla deja de servir de modelo a la segunda.
  assert.equal(PORTADA[0].text, "Adelgaza sin pasar hambre");
});

test("una ruta inventada no crea nada", () => {
  const next = applySectionTexts(PORTADA, {
    "0.inventado": "no",
    "99.text": "tampoco",
    "2.items.9": "ni esto",
  });

  assert.equal(next.length, PORTADA.length);
  assert.equal(next[2].items?.length, 2);
});

test("del modelo solo se acepta lo que se le pidió", () => {
  const known = collectSectionTexts(PORTADA).map((one) => one.path);

  const changes = readAdapted(known, [
    { path: "0.text", text: "Nuevo titular" },
    { path: "1.html", text: "<script>malo</script>" },
    { path: "inventada", text: "no" },
    { path: "2.items.0", text: "   " },
  ]);

  assert.deepEqual(changes, { "0.text": "Nuevo titular" });
});

test("el encargo prohíbe dejar rastro del producto anterior", () => {
  /*
   * Es el fallo caro de clonar: una portada medio adaptada parece terminada, y
   * el nombre del producto viejo aparece en la frase catorce, que nadie relee.
   */
  const prompt = buildClonePrompt({
    fields: collectSectionTexts(PORTADA),
    productName: "TiniCalm",
    audience: "mayores de 50",
    country: "Chile",
    fromProduct: "Lymphatic Complex",
  });

  assert.ok(prompt.includes("ni una palabra"));
  assert.ok(prompt.includes("Lymphatic Complex"));
  assert.ok(prompt.includes("no se heredan"), "ni sus cifras de prueba social");
  assert.ok(prompt.includes("0.text"), "cada texto con su ruta");
});

test("los encargos de imagen se piden filmables, no evocadores", () => {
  const prompt = buildSlotPrompt({
    slots: [
      { slot: "hero", purpose: "Portada", prompt: "Un bote sobre la mesilla", alt: "", aspectRatio: "1:1" },
    ],
    productName: "TiniCalm",
    audience: "mayores de 50",
    fromProduct: "Lymphatic Complex",
  });

  assert.ok(prompt.includes("hero · Portada"));
  assert.ok(prompt.includes("se puede fotografiar"));
  assert.ok(prompt.includes("Nada de texto dentro de la imagen"));
});
