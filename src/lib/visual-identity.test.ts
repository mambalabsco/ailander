import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLOR_LIMIT,
  extractColors,
  extractFonts,
  normalizeHex,
  readVisualIdentity,
} from "./visual-identity.ts";

/* ------------------------------ Normalizar --------------------------------- */

test("el hexadecimal corto se expande", () => {
  assert.equal(normalizeHex("#FFF"), "#ffffff");
  assert.equal(normalizeHex("#1a2"), "#11aa22");
});

test("los tres números sueltos de un tema son un color", () => {
  // Sin esto se perdería la paleta entera de cualquier tema moderno: los guardan
  // así para poder meterles opacidad después.
  assert.equal(normalizeHex("18, 18, 18"), "#121212");
  assert.equal(normalizeHex("255,255,255"), "#ffffff");
});

test("un número fuera de rango no es un color", () => {
  assert.equal(normalizeHex("300,0,0"), "");
  assert.equal(normalizeHex("solid 1px"), "");
});

/* -------------------------------- Colores ---------------------------------- */

test("el papel sale del nombre de la variable", () => {
  const html = `<style>
    .a { --color-background: 255,255,255; --color-foreground: 18,18,18 }
    .b { --color-button: #ff3366; --color-border: #dddddd }
  </style>`;

  const roles = Object.fromEntries(extractColors(html).map((color) => [color.hex, color.role]));

  assert.equal(roles["#ffffff"], "fondo");
  assert.equal(roles["#121212"], "texto");
  assert.equal(roles["#ff3366"], "botón");
  assert.equal(roles["#dddddd"], "borde");
});

test("manda el más repetido, no el primero", () => {
  const html = `<style>
    .x { --color-accent: #112233 }
    .y { color: #ff3366 } .z { background: #ff3366 } .w { border-color: #ff3366 }
  </style>`;

  assert.equal(extractColors(html)[0].hex, "#ff3366");
});

test("no se pasa del límite aunque la página tenga cincuenta colores", () => {
  const html = Array.from({ length: 40 }, (_, i) => `#${i.toString(16).padStart(6, "0")}`).join(" ");

  assert.equal(readVisualIdentity(html).colors.length, COLOR_LIMIT);
});

/* ------------------------------ Tipografías -------------------------------- */

test("la fuente de Shopify sale con su identificador exacto", () => {
  const html = `<link href="https://fonts.shopifycdn.com/assistant/assistant_n4.abc123.woff2">`;

  assert.deepEqual(extractFonts(html), [{ family: "Assistant", handle: "assistant_n4" }]);
});

test("la de Google sale sin identificador, para que no rompa el tema", () => {
  // Shopify quizá tenga Poppins, pero inventarse «poppins_n4» para averiguarlo
  // deja el tema sin fuente. Se enseña y se elige a mano.
  const html = `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap">`;
  const [font] = extractFonts(html);

  assert.equal(font.family, "Poppins");
  assert.equal(font.handle, null);
});

test("una fuente repetida en varios pesos no se cuenta dos veces", () => {
  const html = `
    <link href="https://fonts.shopifycdn.com/assistant/assistant_n4.a.woff2">
    <link href="https://fonts.shopifycdn.com/assistant/assistant_n4.b.woff">`;

  assert.equal(extractFonts(html).length, 1);
});

/* ------------------------------- El conjunto ------------------------------- */

test("una página real deja paleta, fuente y radio", () => {
  const html = `<!doctype html><html><head>
    <link href="https://fonts.shopifycdn.com/archivo/archivo_n4.x.woff2" rel="preload">
    <style>
      :root { --buttons-radius: 8px }
      .color-scheme-1 { --color-background: 255,255,255; --color-foreground: 18,18,18 }
      .color-scheme-2 { --color-button: 255,51,102 }
    </style>
  </head><body>hola</body></html>`;

  const identity = readVisualIdentity(html);

  assert.equal(identity.buttonRadius, "8px");
  assert.equal(identity.fonts[0].handle, "archivo_n4");
  assert.ok(identity.colors.some((color) => color.hex === "#ff3366" && color.role === "botón"));
});

test("una página sin nada de esto no revienta", () => {
  const identity = readVisualIdentity("<html><body>solo texto</body></html>");

  assert.deepEqual(identity.colors, []);
  assert.deepEqual(identity.fonts, []);
  assert.equal(identity.buttonRadius, null);
});
