import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WORDS_PER_LINE,
  captionFrames,
  captionPieces,
  captionSvg,
  wrap,
  wrapWords,
} from "./captions.ts";

/* -------------------------------- Los trozos ------------------------------- */

test("una frase se parte en trozos que se leen al ritmo de la voz", () => {
  // Una frase entera en pantalla se lee de un vistazo y deja de acompañar.
  const pieces = captionPieces({
    written: "Duermes ocho horas y despiertas cansada otra vez",
    start: 0,
    end: 4,
  });

  assert.equal(pieces.length, 3);
  assert.equal(pieces[0].text, "Duermes ocho horas");
  assert.equal(pieces[1].text, "y despiertas cansada");
});

test("los trozos cubren el tramo entero y no se solapan", () => {
  const pieces = captionPieces({ written: "una dos tres cuatro cinco seis", start: 2, end: 5 });

  assert.equal(pieces[0].start, 2);
  assert.equal(pieces[pieces.length - 1].end, 5);
  assert.equal(pieces[0].end, pieces[1].start);
});

test("el último trozo dura a proporción de lo que lleva", () => {
  // A partes iguales, un trozo de una palabra duraría lo mismo que uno de tres y
  // se quedaría clavado en pantalla.
  const pieces = captionPieces({ written: "una dos tres cuatro", start: 0, end: 4 });

  assert.equal(pieces[0].end, 3, "las tres primeras ocupan tres cuartos");
  assert.equal(pieces[1].start, 3);
  assert.equal(pieces[1].end, 4);
});

test("el texto escrito manda sobre el hablado", () => {
  /*
   * El guion va fonético para que la voz pronuncie bien —«eme ce te»— y el
   * subtítulo tiene que decir «MCT». Por eso los tiempos se reparten sobre el
   * tramo y no se emparejan palabra a palabra: son distintos números de palabra.
   */
  const pieces = captionPieces({ written: "MCT al despertar", start: 0, end: 3 });

  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].text, "MCT al despertar");
  assert.equal(pieces[0].end, 3);
});

test("sin texto o sin tramo no hay subtítulo", () => {
  assert.deepEqual(captionPieces({ written: "   ", start: 0, end: 3 }), []);
  assert.deepEqual(captionPieces({ written: "hola", start: 3, end: 3 }), []);
});

test("el tamaño de trozo se puede ajustar", () => {
  const pieces = captionPieces({ written: "una dos tres cuatro", start: 0, end: 4, perLine: 2 });

  assert.equal(pieces.length, 2);
  assert.equal(WORDS_PER_LINE, 3);
});

/* --------------------------------- El dibujo ------------------------------- */

test("el subtítulo lleva borde: sin él desaparece sobre fondo claro", () => {
  // Y media escena de un anuncio de suplementos es clara.
  const svg = captionSvg({ words: ["Hola"], width: 720, height: 1280 });

  assert.match(svg, /stroke="#000000"/);
  assert.match(svg, /paint-order="stroke fill"/);
});

test("va a dos tercios: abajo del todo lo tapa la interfaz de la red", () => {
  const svg = captionSvg({ words: ["Hola"], width: 720, height: 1280, fontSize: 40 });
  const y = Number(/<tspan[^>]*y="(\d+)"/.exec(svg)![1]);

  // A dos tercios, no pegado abajo: esa franja la tapan la interfaz y el pulgar.
  assert.ok(y > 1280 * 0.6 && y < 1280 * 0.85, `salió en ${y}`);
});

test("un texto con signos raros no rompe el dibujo", () => {
  // Un `&` sin escapar deja el SVG inválido y la imagen sale vacía sin avisar.
  const svg = captionSvg({ words: ["Ahorra", "40%", '&', '"más"'], width: 720, height: 1280 });

  assert.match(svg, /&amp;/);
  assert.match(svg, /&quot;/);
  assert.ok(!/&(?!amp;|quot;|lt;|gt;|apos;)/.test(svg), "quedó un signo sin escapar");
});

test("un texto largo se parte en líneas sin cortar palabras", () => {
  const lines = wrap("Duermes ocho horas y despiertas cansada", 18);

  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => line.length <= 18 || !line.includes(" ")));
  assert.equal(lines.join(" "), "Duermes ocho horas y despiertas cansada");
});

/* ------------------------------ Palabra a palabra -------------------------- */

test("cada palabra tiene su fotograma, con ella encendida", () => {
  const [uno, dos, tres] = captionFrames({ text: "no es tuya", start: 0, end: 3 });

  assert.deepEqual(uno.words, ["no", "es", "tuya"]);
  assert.equal(uno.active, 0);
  assert.equal(dos.active, 1);
  assert.equal(tres.active, 2);
});

test("el reparto va por lo larga que es la palabra, no a partes iguales", () => {
  /*
   * «de» y «convertirla» no se tardan lo mismo en decir. A partes iguales el
   * resaltado se adelanta en las largas y se atrasa en las cortas, que es justo
   * cuando se nota que va mal.
   */
  const [corta, larga] = captionFrames({ text: "de convertirla", start: 0, end: 10 });

  assert.ok(larga.end - larga.start > (corta.end - corta.start) * 2);
  assert.equal(corta.end, larga.start, "sin huecos entre palabras");
  assert.equal(larga.end, 10);
});

test("los fotogramas cubren el trozo entero", () => {
  const frames = captionFrames({ text: "una dos tres", start: 4, end: 7 });

  assert.equal(frames[0].start, 4);
  assert.equal(frames[frames.length - 1].end, 7);
});

test("la palabra que suena sale en amarillo y más grande", () => {
  const svg = captionSvg({ words: ["no", "es", "tuya"], active: 1, width: 720, height: 1280 });

  const tspans = [...svg.matchAll(/<tspan fill="([^"]+)" font-size="(\d+)"/g)];

  assert.equal(tspans.length, 3);
  assert.equal(tspans[0][1], "#ffffff");
  assert.equal(tspans[1][1], "#ffe11a", "la de en medio, encendida");
  assert.ok(Number(tspans[1][2]) > Number(tspans[0][2]), "y más grande");
});

test("sin ninguna encendida salen todas en blanco", () => {
  const svg = captionSvg({ words: ["una", "dos"], active: -1, width: 720, height: 1280 });

  assert.ok(!svg.includes("#ffe11a"));
});

test("un trozo largo se parte en líneas sin cortar palabras", () => {
  const lines = wrapWords(["DUERMES", "OCHO", "HORAS", "SEGUIDAS"], 14);

  assert.ok(lines.length > 1);
  assert.deepEqual(lines.flat(), ["DUERMES", "OCHO", "HORAS", "SEGUIDAS"]);
});
