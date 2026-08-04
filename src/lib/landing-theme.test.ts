import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_THEME,
  luminance,
  mix,
  readableOn,
  themeFrom,
} from "./landing-theme.ts";

/* ------------------------------- Los colores ------------------------------- */

test("la luz de un color usa los pesos del ojo, no la media", () => {
  // El verde pesa siete veces más que el azul. Con la media, un azul oscuro y
  // un verde medio saldrían iguales.
  assert.ok(luminance("#00ff00") > luminance("#0000ff"));
  assert.ok(luminance("#ffffff") > 0.9);
  assert.ok(luminance("#000000") < 0.05);
});

test("un color de tres cifras vale igual", () => {
  assert.equal(luminance("#fff"), luminance("#ffffff"));
});

test("sobre claro va negro y sobre oscuro blanco", () => {
  assert.equal(readableOn("#ffffff"), "#000000");
  assert.equal(readableOn("#1a1a1a"), "#ffffff");
});

test("un rojo de marca lleva texto blanco", () => {
  // Un umbral ingenuo en la mitad mandaría negro aquí.
  assert.equal(readableOn("#c0202a"), "#ffffff");
});

test("mezclar da un punto entre los dos", () => {
  assert.equal(mix("#000000", "#ffffff", 0), "#000000");
  assert.equal(mix("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
});

/* ------------------------------- El aspecto -------------------------------- */

test("sin referencia sale el de siempre", () => {
  // Una landing sin referencia tiene que salir exactamente como salía antes:
  // arreglar una cosa y mover de paso el aspecto de todo lo ya generado sería
  // cambiar lo que nadie pidió.
  assert.deepEqual(themeFrom({}), DEFAULT_THEME);
});

/*
 * El color más usado de una página suele ser el del **texto** —hay más letras
 * que fondo en píxeles de regla CSS—, así que coger el primero como fondo da una
 * página negra con letras negras.
 */
test("el fondo es el más claro y el texto el más oscuro, no el primero", () => {
  const theme = themeFrom({ colors: ["#111111", "#fdfbf7", "#c0202a"] });

  assert.equal(theme.background, "#fdfbf7");
  assert.equal(theme.ink, "#111111");
});

test("el acento es el más vivo de los que quedan", () => {
  const theme = themeFrom({ colors: ["#111111", "#ffffff", "#c0202a", "#888888"] });

  assert.equal(theme.accent, "#c0202a");
  // Y su texto se calcula para que se lea.
  assert.equal(theme.onAccent, "#ffffff");
});

test("un gris no pasa por acento", () => {
  // Menos de cuarenta de diferencia entre canales es un gris.
  const theme = themeFrom({ colors: ["#111111", "#ffffff", "#909294"] });

  assert.equal(theme.accent, DEFAULT_THEME.accent);
});

/*
 * Sin contraste no hay paleta que sacar: la página traía un solo tono. Volver a
 * lo de siempre es mejor que entregar texto del color del fondo.
 */
test("una paleta sin contraste se descarta entera", () => {
  const theme = themeFrom({ colors: ["#f0f0f0", "#f4f4f4", "#eeeeee"] });

  assert.equal(theme.ink, DEFAULT_THEME.ink);
  assert.equal(theme.background, DEFAULT_THEME.background);
});

test("los secundarios se componen, no se buscan", () => {
  // Mezclar texto y fondo da un gris que pega con los dos; buscarlo entre los
  // de la página trae cualquier cosa.
  const theme = themeFrom({ colors: ["#000000", "#ffffff"] });

  assert.ok(luminance(theme.muted) > luminance(theme.ink));
  assert.ok(luminance(theme.line) > luminance(theme.muted));
  assert.ok(luminance(theme.surface) > luminance(theme.line));
});

test("lo que no es un color se ignora", () => {
  const theme = themeFrom({ colors: ["rgb(1,2,3)", "var(--x)", "#111111", "#ffffff"] });

  assert.equal(theme.ink, "#111111");
});

/* -------------------------------- La letra --------------------------------- */

test("la primera fuente es la del titular y la segunda la del cuerpo", () => {
  const theme = themeFrom({ fonts: ["Playfair Display", "Inter"] });

  assert.match(theme.headingFont, /^"Playfair Display"/);
  assert.match(theme.bodyFont, /^Inter/);
});

test("con una sola fuente se usa para las dos cosas", () => {
  const theme = themeFrom({ fonts: ["Inter"] });

  assert.match(theme.headingFont, /^Inter/);
  assert.match(theme.bodyFont, /^Inter/);
});

/*
 * La fuente de la referencia se sirve desde **su** dominio y aquí no está: sin
 * alternativa, el navegador cae a Times New Roman y la página parece de 1998.
 */
test("siempre lleva una alternativa del sistema detrás", () => {
  assert.match(themeFrom({ fonts: ["Playfair Display"] }).headingFont, /apple-system/);
});

test("una fuente con espacios va entre comillas, o la regla no vale", () => {
  assert.match(themeFrom({ fonts: ["Playfair Display"] }).headingFont, /"Playfair Display"/);
  assert.equal(themeFrom({ fonts: ["Inter"] }).headingFont.startsWith('"'), false);
});

/* -------------------------------- El ancho --------------------------------- */

test("el ancho se respeta dentro de lo legible", () => {
  assert.equal(themeFrom({ width: 720 }).width, 720);
});

/*
 * Por debajo de 520 no cabe una línea cómoda; por encima de 900 se pasa de los
 * setenta y cinco caracteres a partir de los cuales el ojo pierde el renglón.
 */
test("un ancho imposible se recorta a lo legible", () => {
  assert.equal(themeFrom({ width: 1600 }).width, 900);
  assert.equal(themeFrom({ width: 200 }).width, 520);
  assert.equal(themeFrom({ width: Number.NaN }).width, DEFAULT_THEME.width);
});
