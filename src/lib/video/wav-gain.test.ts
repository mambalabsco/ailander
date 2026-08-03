import assert from "node:assert/strict";
import { test } from "node:test";
import { MUSIC_GAIN, attenuateWav, buildMusicPrompt } from "./wav-gain.ts";

/** Un WAV mínimo de 16 bits con las muestras que se le pasen. */
function wav(samples: number[], extraChunk = false): Uint8Array {
  const data = samples.length * 2;
  const extra = extraChunk ? 8 + 6 : 0; // Un bloque de metadatos de tamaño impar.
  const bytes = new Uint8Array(44 + extra + data);
  const view = new DataView(bytes.buffer);

  const tag = (offset: number, text: string) => {
    for (let i = 0; i < 4; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };

  tag(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  let offset = 36;

  if (extraChunk) {
    tag(offset, "LIST");
    view.setUint32(offset + 4, 5, true); // Impar: lleva un byte de relleno.
    offset += 8 + 6;
  }

  tag(offset, "data");
  view.setUint32(offset + 4, data, true);

  samples.forEach((sample, index) => view.setInt16(offset + 8 + index * 2, sample, true));

  return bytes;
}

function samplesOf(bytes: Uint8Array, count: number, extraChunk = false): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = 44 + (extraChunk ? 14 : 0);

  return Array.from({ length: count }, (_, i) => view.getInt16(start + i * 2, true));
}

test("baja el volumen de las muestras", () => {
  const out = attenuateWav(wav([10000, -10000]), 0.1);

  assert.deepEqual(samplesOf(out, 2), [1000, -1000]);
});

test("encuentra las muestras aunque haya metadatos delante", () => {
  /*
   * No vale asumir que empiezan en el byte 44: muchos generadores meten un
   * bloque antes, y ahí el 44 cae en mitad de un texto — multiplicarlo destroza
   * el audio en vez de bajarle el volumen.
   */
  const out = attenuateWav(wav([20000, -20000], true), 0.5);

  assert.deepEqual(samplesOf(out, 2, true), [10000, -10000]);
});

test("no da la vuelta al entero en los picos", () => {
  // Un valor fuera de rango suena como un chasquido justo en lo más alto.
  const out = attenuateWav(wav([32000]), 2);

  assert.equal(samplesOf(out, 1)[0], 32767);
});

test("un archivo que no se puede leer se devuelve tal cual", () => {
  // Mejor una música alta —que se oye y se cambia— que estática que parece un
  // fallo del montaje.
  const roto = new Uint8Array([1, 2, 3, 4]);

  assert.equal(attenuateWav(roto), roto);
});

test("el volumen por defecto deja oír la voz", () => {
  assert.ok(MUSIC_GAIN > 0.08 && MUSIC_GAIN < 0.2, `salió ${MUSIC_GAIN}`);
});

/* ------------------------------- El encargo -------------------------------- */

test("la música se pide sin voz y sin melodía protagonista", () => {
  // Una cama con voz compite con la locución por el mismo sitio del oído.
  const prompt = buildMusicPrompt({ productName: "X", audience: "mujeres de 45 a 65" });

  assert.match(prompt, /No vocals/i);
  assert.match(prompt, /no prominent lead melody/i);
  assert.match(prompt, /mujeres de 45 a 65/);
});
