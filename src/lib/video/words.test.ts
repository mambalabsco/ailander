import { test } from "node:test";
import assert from "node:assert/strict";

import { charactersToWords, spokenSeconds, spokenText, type Alignment } from "./words.ts";

/** Construye una alineación con un tiempo por carácter, `step` segundos cada uno. */
function align(text: string, step = 0.1): Alignment {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * step),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * step),
  };
}

test("agrupa los caracteres en palabras", () => {
  const words = charactersToWords(align("hola mundo"));

  assert.deepEqual(
    words.map((word) => word.word),
    ["hola", "mundo"],
  );
});

test("la palabra acaba en su último carácter, no en el espacio siguiente", () => {
  /*
   * Usar el inicio del espacio como final mete el silencio dentro de la
   * palabra, y todos los cortes salen largos. Con «hola» (4 caracteres a 0,1 s)
   * el final correcto es 0,4 y no 0,5.
   */
  const words = charactersToWords(align("hola mundo"));

  assert.equal(words[0].start, 0);
  assert.equal(Number(words[0].end.toFixed(2)), 0.4);
  // «mundo» empieza en el quinto carácter, después del espacio.
  assert.equal(Number(words[1].start.toFixed(2)), 0.5);
});

test("los espacios múltiples y los saltos de línea no crean palabras vacías", () => {
  const words = charactersToWords(align("uno  dos\ntres"));

  assert.deepEqual(
    words.map((word) => word.word),
    ["uno", "dos", "tres"],
  );
});

test("la puntuación se queda pegada a la palabra", () => {
  // Quien compara después ya normaliza; decidirlo dos veces acabaría divergiendo.
  const words = charactersToWords(align("triste. Vacía"));

  assert.equal(words[0].word, "triste.");
});

test("un texto vacío no da palabras", () => {
  assert.deepEqual(charactersToWords(align("")), []);
  assert.deepEqual(charactersToWords(align("   ")), []);
});

test("arrays de distinta longitud no producen tiempos NaN", () => {
  /*
   * Si la respuesta llega recortada, recorrer por el array más largo daría
   * tiempos `undefined` que acaban en `NaN` dentro de la duración de una toma —y
   * un NaN se propaga hasta el montaje sin dar ningún error.
   */
  const roto: Alignment = {
    characters: [..."hola mundo"],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
  };

  const words = charactersToWords(roto);

  assert.deepEqual(
    words.map((word) => word.word),
    ["hola"],
  );
  for (const word of words) {
    assert.ok(Number.isFinite(word.start), "start debe ser un número");
    assert.ok(Number.isFinite(word.end), "end debe ser un número");
  }
});

test("el texto reconstruido sirve para ver qué se pronunció de verdad", () => {
  /*
   * El generador normaliza por su cuenta —expande números, quita símbolos— y
   * entonces los cortes del guion original no encuentran sus palabras. Ver el
   * texto real convierte «faltan las tomas 3 y 4» en algo diagnosticable.
   */
  assert.equal(spokenText(charactersToWords(align("uno dos tres"))), "uno dos tres");
});

test("la voz acaba en la última palabra, no en el final del archivo", () => {
  // El mp3 trae cola de silencio; montar contra ella dejaría el vídeo en negro.
  const words = charactersToWords(align("hola"));

  assert.equal(Number(spokenSeconds(words).toFixed(2)), 0.4);
  assert.equal(spokenSeconds([]), 0);
});
