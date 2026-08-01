import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEditPrompt,
  buildReadingPrompt,
  nearestRatio,
  readImageSize,
  reviewReading,
  type ImageReading,
} from "./image-adapt.ts";

/* ------------------------------ El tamaño real ----------------------------- */

test("la proporción es la admitida más cercana a la real", () => {
  // Pedir una que no está hace fallar la generación; pedir otra distinta
  // devuelve la escena recortada, que en una foto de producto se ve enseguida.
  assert.equal(nearestRatio(1000, 1000), "1:1");
  assert.equal(nearestRatio(1080, 1350), "4:5");
  assert.equal(nearestRatio(1080, 1920), "9:16");
  assert.equal(nearestRatio(1920, 1080), "16:9");
});

test("una medida imposible cae en cuadrado en vez de reventar", () => {
  assert.equal(nearestRatio(0, 0), "1:1");
  assert.equal(nearestRatio(-5, 10), "1:1");
});

test("el tamaño de un PNG se lee de su cabecera", () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47]);
  new DataView(png.buffer).setUint32(16, 1200);
  new DataView(png.buffer).setUint32(20, 1500);

  assert.deepEqual(readImageSize(png), { width: 1200, height: 1500 });
});

test("y el de un JPEG saltando sus marcadores", () => {
  // 0xFFD8, un marcador de relleno con longitud, y después el SOF0.
  const jpeg = new Uint8Array(40);
  const view = new DataView(jpeg.buffer);

  jpeg.set([0xff, 0xd8], 0);
  jpeg.set([0xff, 0xe0], 2);
  view.setUint16(4, 6);
  jpeg.set([0xff, 0xc0], 10);
  view.setUint16(12, 17);
  view.setUint16(15, 800);
  view.setUint16(17, 600);

  assert.deepEqual(readImageSize(jpeg), { width: 600, height: 800 });
});

test("un marcador que no describe la trama no se confunde con uno que sí", () => {
  // 0xC4 cae en el mismo rango que los SOF y no es uno: es el fallo clásico.
  const jpeg = new Uint8Array(40);
  const view = new DataView(jpeg.buffer);

  jpeg.set([0xff, 0xd8], 0);
  jpeg.set([0xff, 0xc4], 2);
  view.setUint16(4, 6);
  jpeg.set([0xff, 0xc0], 10);
  view.setUint16(12, 17);
  view.setUint16(15, 1000);
  view.setUint16(17, 1000);

  assert.deepEqual(readImageSize(jpeg), { width: 1000, height: 1000 });
});

test("lo que no es una imagen conocida devuelve nada", () => {
  assert.equal(readImageSize(new Uint8Array([1, 2, 3])), null);
});

/* ------------------------------- El encargo -------------------------------- */

function lectura(over: Partial<ImageReading> = {}): ImageReading {
  return {
    scene: "Bote sobre mármol con hojas de eucalipto, luz lateral suave.",
    text: "",
    textFits: true,
    textReason: "",
    suggestedText: "",
    brandNames: [],
    ...over,
  };
}

test("el envase va siempre por referencia, nunca descrito", () => {
  // Un envase escrito con palabras sale inventado, y un envase inventado en una
  // ficha de producto es una devolución.
  const prompt = buildEditPrompt({ reading: lectura(), productName: "Lymphatic Complex" });

  assert.match(prompt, /imagen de referencia adjunta/);
  assert.match(prompt, /misma forma de envase/);
});

test("el texto que vale se conserva en su sitio", () => {
  const prompt = buildEditPrompt({
    reading: lectura({ text: "100% Vegan", textFits: true }),
    productName: "X",
  });

  assert.match(prompt, /Conserva el texto/);
  assert.ok(!prompt.includes("Sustituye el texto"));
});

test("el que no vale se sustituye por el propuesto", () => {
  const prompt = buildEditPrompt({
    reading: lectura({
      text: "Reduce cellulite",
      textFits: false,
      suggestedText: "Apoya el drenaje linfático",
    }),
    productName: "X",
  });

  assert.match(prompt, /«Apoya el drenaje linfático»/);
  assert.match(prompt, /mismo estilo tipográfico/);
});

test("si no vale y no hay recambio, la escena sale limpia", () => {
  const prompt = buildEditPrompt({
    reading: lectura({ text: "Algo", textFits: false }),
    productName: "X",
  });

  assert.match(prompt, /Quita el texto/);
});

test("las marcas ajenas se nombran una a una", () => {
  // «Quita las marcas» se cumple a medias: deja el logo de la esquina o el
  // grabado de la tapa. Nombrándolas, las quita.
  const prompt = buildEditPrompt({
    reading: lectura({ brandNames: ["Sculptique", "SmoothSkin"] }),
    productName: "X",
  });

  assert.match(prompt, /Sculptique, SmoothSkin/);
  assert.match(prompt, /ni en la tapa/i);
});

test("mejorar conserva la composición en vez de rehacerla", () => {
  const prompt = buildEditPrompt({ reading: lectura(), productName: "X", mode: "mejorar" });

  assert.match(prompt, /Mejora esta imagen conservando su composición/);
});

test("lo que se pida a mano se añade al encargo", () => {
  const prompt = buildEditPrompt({
    reading: lectura(),
    productName: "X",
    extra: "Que el bote se vea más grande.",
  });

  assert.match(prompt, /más grande/);
});

/* -------------------------------- El repaso -------------------------------- */

test("no puede valer el texto y a la vez haber una marca ajena", () => {
  const warnings = reviewReading(lectura({ text: "X de Sculptique", textFits: true, brandNames: ["Sculptique"] }));

  assert.match(warnings.join(" "), /no puede ser las dos cosas/);
});

test("un texto que no vale y sin recambio se avisa", () => {
  assert.match(reviewReading(lectura({ text: "X", textFits: false })).join(" "), /sin él/);
});

test("una lectura correcta no da avisos", () => {
  assert.deepEqual(reviewReading(lectura()), []);
});

test("el prompt de lectura pide el texto literal y las marcas", () => {
  const prompt = buildReadingPrompt("Lymphatic Complex", "Investigación…");

  assert.match(prompt, /literal y entero/);
  assert.match(prompt, /brandNames/);
  assert.match(prompt, /Ante la duda, no vale/);
});
