import { test } from "node:test";
import assert from "node:assert/strict";

import { STRUCTURE, buildScriptPrompt, buildStylePrompt, wordsFor } from "./script-prompt.ts";

const INPUT = {
  productName: "Naturox",
  audience: "mujeres de 35 a 55",
  country: "Chile",
  body: "Duermes ocho horas y despiertas cansada.",
  shots: 6,
  seconds: 60,
};

test("el ritmo de locución convierte segundos en palabras", () => {
  /*
   * Importa porque una toma escrita para diez segundos y locutada en seis deja
   * el vídeo corto, y al revés obliga a pagar clips de diez.
   */
  assert.equal(wordsFor(10), 26);
  assert.equal(wordsFor(5), 13);
});

test("el prompt lleva el texto de partida entero", () => {
  assert.ok(buildScriptPrompt(INPUT).includes(INPUT.body));
});

test("dice cuántos segundos y cuántas palabras por toma", () => {
  const prompt = buildScriptPrompt(INPUT);

  // 60 s entre 6 tomas son 10 s y unas 26 palabras cada una.
  assert.ok(prompt.includes("10.0 s"));
  assert.ok(prompt.includes("26 palabras"));
});

test("exige las tres piezas de cada toma", () => {
  /*
   * Un guion sin «qué se mueve» produce animaciones que flotan, que es el
   * defecto característico del vídeo generado.
   */
  const prompt = buildScriptPrompt(INPUT);

  assert.ok(prompt.includes("**guion**"));
  assert.ok(prompt.includes("**scene**"));
  assert.ok(prompt.includes("**motion**"));
  assert.ok(prompt.includes("nunca «gira» ni «orbita»".replace("nunca ", "Nunca ")));
});

test("pide el texto fonético y su forma de pantalla", () => {
  const prompt = buildScriptPrompt(INPUT);

  assert.ok(prompt.includes("eme ce te"));
  assert.ok(prompt.includes("solo si difiere"));
});

test("las dos reglas duras están escritas", () => {
  const prompt = buildScriptPrompt(INPUT);

  assert.ok(prompt.includes("La última toma es `producto`"));
  assert.ok(prompt.includes("No inventes credenciales"));
});

test("el estilo se pide aparte, para que sea idéntico en todas las tomas", () => {
  /*
   * Si se pidiera dentro de cada toma, el modelo lo variaría un poco cada vez y
   * se perdería justo lo que hace que el vídeo parezca uno solo.
   */
  const prompt = buildStylePrompt(INPUT);

  assert.ok(prompt.includes("idéntica"));
  assert.ok(prompt.includes("«cinematic» no vale"));
});

test("la estructura de venta empieza por el gancho", () => {
  assert.ok(STRUCTURE[0].startsWith("GANCHO"));
  assert.ok(STRUCTURE.some((step) => step.startsWith("PRODUCTO")));
});
