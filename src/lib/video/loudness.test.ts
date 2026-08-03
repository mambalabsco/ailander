import assert from "node:assert/strict";
import { test } from "node:test";

import {
  belowVoice,
  drownsVoice,
  findMusicLevel,
  MUSIC_LEVELS,
  VOICE_LUFS,
} from "./loudness.ts";

test("los tres niveles dejan la música por debajo de la voz", () => {
  for (const level of MUSIC_LEVELS) {
    assert.ok(level.lufs < VOICE_LUFS, `«${level.label}» no queda por debajo de la voz`);
  }
});

test("la distancia a la voz está en el rango que deja entenderla", () => {
  // Menos de diez LU tapa las consonantes; más de veintidós no se oye.
  for (const level of MUSIC_LEVELS) {
    const distance = belowVoice(level);

    assert.ok(distance >= 10, `«${level.label}» taparía la voz (${distance} LU)`);
    assert.ok(distance <= 22, `«${level.label}» no se oiría (${distance} LU)`);
  }
});

test("van de más suave a más presente", () => {
  const levels = MUSIC_LEVELS.map((level) => level.lufs);

  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
});

test("el nivel de en medio es el que sale por defecto", () => {
  assert.equal(findMusicLevel("no-existe").id, "normal");
  assert.equal(findMusicLevel("suave").id, "suave");
});

test("todos los niveles caben en lo que acepta el normalizador", () => {
  // La API acepta de -70 a -5 LUFS.
  for (const level of MUSIC_LEVELS) {
    assert.ok(level.lufs >= -70 && level.lufs <= -5, level.label);
  }
});

test("avisa cuando un nivel a mano se comería la voz", () => {
  assert.equal(drownsVoice(-32), false);
  assert.equal(drownsVoice(-20), true);
  assert.equal(drownsVoice(VOICE_LUFS), true);
});

test("cada nivel se explica en qué caso usarlo", () => {
  for (const level of MUSIC_LEVELS) {
    assert.ok(level.note.length > 30, `«${level.label}» sin explicar`);
  }
});
