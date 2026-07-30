import { test } from "node:test";
import assert from "node:assert/strict";

import { checkLength, countWords, expansionPrompt, lengthBrief } from "./word-count.ts";

/* -------------------------------- Contar ---------------------------------- */

test("cuenta como lo haría un procesador de textos", () => {
  assert.equal(countWords("Hola mundo"), 2);
  assert.equal(countWords("  Hola   mundo  "), 2);
  assert.equal(countWords("Hola\nmundo\n\notra vez"), 4);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   "), 0);
});

test("la puntuación no crea palabras", () => {
  assert.equal(countWords("¿Cansada? Sí, mucho."), 3);
  assert.equal(countWords('Me dijo: «estás en el límite».'), 6);
});

test("una raya de diálogo no es una palabra", () => {
  // «—No estoy triste —dijo.» son cuatro: No, estoy, triste, dijo.
  assert.equal(countWords("—No estoy triste —dijo."), 4);
});

test("una coma decimal no parte el número", () => {
  // «El análisis decía TSH 6,8» son cinco palabras, no seis.
  assert.equal(countWords("El análisis decía TSH 6,8"), 5);
});

test("un guion de unión no parte la palabra", () => {
  assert.equal(countWords("efecto anti-inflamatorio"), 2);
});

test("los símbolos sueltos de una lista no se cuentan", () => {
  assert.equal(countWords("- uno\n- dos\n- tres"), 3);
  assert.equal(countWords("* * *"), 0);
});

/* ------------------------------- El veredicto ------------------------------ */

const RANGO: [number, number] = [1200, 1400];

function texto(palabras: number): string {
  return Array.from({ length: palabras }, (_, index) => `palabra${index}`).join(" ");
}

test("una pieza dentro del rango está bien", () => {
  assert.equal(checkLength(texto(1300), RANGO).verdict, "ok");
  assert.equal(checkLength(texto(1200), RANGO).verdict, "ok");
  assert.equal(checkLength(texto(1400), RANGO).verdict, "ok");
});

test("hay un 10% de margen por debajo, para no pedir segunda vuelta por nada", () => {
  // 1080 es exactamente el 90% de 1200.
  assert.equal(checkLength(texto(1080), RANGO).verdict, "ok");
  assert.equal(checkLength(texto(1079), RANGO).verdict, "corto");
});

test("el caso real: una pieza de 400 palabras se detecta como corta", () => {
  /*
   * Es el fallo que motivó todo esto. El modelo devolvía una pieza así
   * declarando mil doscientas palabras, y como nadie contaba, se guardaba.
   */
  const check = checkLength(texto(400), RANGO);

  assert.equal(check.verdict, "corto");
  assert.equal(check.words, 400);
  assert.equal(check.missing, 800);
  assert.match(check.message, /400 palabras, se pidieron entre 1200 y 1400/);
});

test("pasarse es informativo, no un fallo", () => {
  /*
   * Un long copy que se pasa suele convertir mejor, así que solo se marca
   * cuando se dispara de verdad. El que se queda corto sí es un problema:
   * el formato depende de tener sitio para construir la tensión.
   */
  assert.equal(checkLength(texto(1600), RANGO).verdict, "ok");
  assert.equal(checkLength(texto(1800), RANGO).verdict, "largo");
});

/* -------------------------------- Los prompts ------------------------------ */

test("la instrucción de longitud traduce a párrafos, no solo a palabras", () => {
  const brief = lengthBrief([1200, 1400]);

  assert.ok(brief.includes("1200"));
  assert.ok(brief.includes("1400"));
  // 1300 / 65 ≈ 20 párrafos. Es la unidad con la que se escribe.
  assert.ok(brief.includes("20 párrafos"));
  assert.ok(brief.includes("sigue desarrollando"));
});

test("la ampliación pide continuar, no reescribir", () => {
  /*
   * Reescribir devuelve otra pieza igual de corta, porque el modelo repite su
   * propio criterio de longitud. Decirle dónde añadir es lo que funciona.
   */
  const prompt = expansionPrompt({ current: "texto corto", words: 400, range: RANGO });

  assert.ok(prompt.includes("Conserva lo que ya está escrito"));
  assert.ok(prompt.includes("texto corto"), "el texto actual tiene que viajar entero");
  assert.ok(prompt.includes("400 palabras"));
  // Y se le dice explícitamente cómo NO llegar al número.
  assert.ok(prompt.includes("repetir ideas con otras palabras"));
});
