import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BANDS,
  HOOK_MAX,
  MIN_CONTRAST,
  bandForImage,
  buildHookPrompt,
  contrast,
  hookColors,
  hookImageInstruction,
  hookParts,
  luminance,
} from "./ad-hook.ts";

test("el contraste se calcula, no se estima", () => {
  // Los dos extremos conocidos de la fórmula de WCAG: si estos no salen, la
  // implementación está mal y todo lo que decide con ella también.
  assert.equal(Math.round(contrast("#000000", "#FFFFFF")), 21);
  assert.equal(contrast("#123456", "#123456"), 1);

  assert.ok(luminance("#FFFFFF") > 0.99);
  assert.ok(luminance("#000000") < 0.01);

  // Un color mal escrito no puede tumbar la generación de una tanda entera.
  assert.equal(luminance("no es un color"), 0);
});

test("ninguna franja sale con texto ilegible", () => {
  /*
   * Es el fallo que no se ve hasta tener la imagen delante: un acento que no
   * contrasta con su franja se emborrona a tamaño de titular, y para entonces
   * ya se generaron las ocho piezas.
   */
  for (const band of BANDS) {
    const colors = hookColors(band.id);

    assert.ok(
      contrast(colors.ink, colors.band) >= MIN_CONTRAST,
      `el texto no se lee sobre ${band.id}`,
    );
    assert.ok(
      contrast(colors.accent, colors.band) >= MIN_CONTRAST,
      `el acento no se lee sobre ${band.id}`,
    );
    assert.notEqual(colors.accent, colors.ink, `en ${band.id} resaltar no resalta nada`);
  }
});

test("la franja se elige contra la claridad de la imagen", () => {
  // Del mismo tono que la foto, la franja se funde con ella y el anuncio pierde
  // el corte que lo hace parecer un titular.
  assert.equal(bandForImage(0.05), "blanco", "foto oscura, franja clara");
  assert.equal(bandForImage(0.95), "negro", "foto clara, franja oscura");
  assert.equal(bandForImage(0.5), "azul");
});

test("un resaltado largo no lo parte uno corto que va dentro", () => {
  /*
   * Con «grasa» y «8 kg de grasa» en la lista, empezar por el corto partía el
   * largo por la mitad y salían dos resaltados donde había uno.
   */
  const parts = hookParts({
    text: "1 cápsula y 8 kg de grasa desaparecen",
    highlights: ["grasa", "8 kg de grasa"],
  });

  const fuertes = parts.filter((part) => part.strong).map((part) => part.text);

  assert.deepEqual(fuertes, ["8 kg de grasa"]);
  assert.equal(parts.map((part) => part.text).join(""), "1 cápsula y 8 kg de grasa desaparecen");
});

test("sin resaltados la frase sale entera y de una pieza", () => {
  const parts = hookParts({ text: "Duerme mejor esta noche", highlights: [] });

  assert.deepEqual(parts, [{ text: "Duerme mejor esta noche", strong: false }]);
});

test("un resaltado que no está en la frase no rompe nada", () => {
  // Pasa al editar el texto a mano y no el resaltado, que es lo normal.
  const parts = hookParts({ text: "Duerme mejor", highlights: ["ya no está"] });

  assert.equal(parts.map((part) => part.text).join(""), "Duerme mejor");
  assert.ok(!parts.some((part) => part.strong));
});

test("el prompt pide uno por imagen y prohíbe lo que cierra cuentas", () => {
  const prompt = buildHookPrompt({
    scenes: ["Una mujer midiéndose la cintura", "El bote sobre la mesilla"],
    productName: "Lymphatic Complex",
    audience: "mujeres de 30 a 55",
    country: "Chile",
    promise: "menos hinchazón en dos semanas",
  });

  assert.ok(prompt.includes("1. Una mujer midiéndose la cintura"));
  assert.ok(prompt.includes("2. El bote sobre la mesilla"));
  assert.ok(prompt.includes(String(HOOK_MAX)));
  assert.ok(prompt.includes("menos hinchazón en dos semanas"));

  // Las tres cosas que hacen que un anuncio así se caiga: promesas de curar,
  // citas atribuidas a alguien, y logos de medios.
  assert.ok(prompt.includes("curar"));
  assert.ok(prompt.includes("citas atribuidas"));
  assert.ok(prompt.includes("medios de comunicación"));
});

test("al generador de imágenes se le dan los colores, no adjetivos", () => {
  const colors = hookColors("rojo");

  const instruction = hookImageInstruction({
    text: "8 kg en 5 noches",
    highlights: ["8 kg"],
    ...colors,
  });

  assert.ok(instruction.includes(colors.band), "el color de la franja, en hexadecimal");
  assert.ok(instruction.includes(colors.ink));
  assert.ok(instruction.includes(colors.accent));
  assert.ok(instruction.includes("«8 kg»"));
  assert.ok(instruction.includes("no tapa la cara"));
});
