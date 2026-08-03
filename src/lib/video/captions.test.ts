import assert from "node:assert/strict";
import { test } from "node:test";
import { WORDS_PER_LINE, captionPieces, captionSvg, wrap } from "./captions.ts";

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
  const svg = captionSvg({ text: "Hola", width: 720, height: 1280 });

  assert.match(svg, /stroke="#000000"/);
  assert.match(svg, /paint-order="stroke fill"/);
});

test("va a dos tercios: abajo del todo lo tapa la interfaz de la red", () => {
  const svg = captionSvg({ text: "Hola", width: 720, height: 1280, fontSize: 40 });
  const y = Number(/<tspan[^>]*y="(\d+)"/.exec(svg)![1]);

  // A dos tercios, no pegado abajo: esa franja la tapan la interfaz y el pulgar.
  assert.ok(y > 1280 * 0.6 && y < 1280 * 0.85, `salió en ${y}`);
});

test("un texto con signos raros no rompe el dibujo", () => {
  // Un `&` sin escapar deja el SVG inválido y la imagen sale vacía sin avisar.
  const svg = captionSvg({ text: 'Ahorra 40% & "más"', width: 720, height: 1280 });

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
