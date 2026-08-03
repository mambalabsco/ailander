import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampSettings,
  DEFAULT_PRESET,
  driftsBetweenShots,
  findVoicePreset,
  toApi,
  VOICE_PRESETS,
} from "./voice-settings.ts";

test("los ajustes preparados caben en lo que acepta la API", () => {
  // Fuera de rango devuelve 422 y la generación se pierde entera.
  for (const preset of VOICE_PRESETS) {
    const s = preset.settings;

    assert.ok(s.stability >= 0 && s.stability <= 1, preset.id);
    assert.ok(s.similarity >= 0 && s.similarity <= 1, preset.id);
    assert.ok(s.style >= 0 && s.style <= 1, preset.id);
    assert.ok(s.speed >= 0.7 && s.speed <= 1.2, preset.id);
  }
});

test("el que sale por defecto existe", () => {
  assert.ok(VOICE_PRESETS.some((preset) => preset.id === DEFAULT_PRESET));
  assert.equal(findVoicePreset("no-existe").id, DEFAULT_PRESET);
});

test("cada ajuste dice para qué sirve", () => {
  for (const preset of VOICE_PRESETS) {
    assert.ok(preset.note.length > 25, `${preset.id} sin explicar`);
  }
});

test("van de más plano a más emocionado", () => {
  const narrador = findVoicePreset("narrador").settings;
  const intenso = findVoicePreset("intenso").settings;

  // Menos estabilidad es más emoción, no menos.
  assert.ok(intenso.stability < narrador.stability);
  assert.ok(intenso.style > narrador.style);
});

/* ------------------------------ Los límites -------------------------------- */

test("lo que se pasa de rango se recorta en vez de reventar la generación", () => {
  const safe = clampSettings({ stability: 5, similarity: -2, style: 99, speed: 3 });

  assert.equal(safe.stability, 1);
  assert.equal(safe.similarity, 0);
  assert.equal(safe.style, 1);
  assert.equal(safe.speed, 1.2);
});

test("la velocidad no baja de donde la voz arrastra las sílabas", () => {
  assert.equal(clampSettings({ speed: 0.1 }).speed, 0.7);
});

test("lo que no se toca se queda como el ajuste por defecto", () => {
  const base = findVoicePreset(DEFAULT_PRESET).settings;

  assert.deepEqual(clampSettings({}), base);
  assert.equal(clampSettings({ speed: 1.1 }).stability, base.stability);
});

test("un número imposible no se cuela", () => {
  assert.equal(clampSettings({ stability: Number.NaN }).stability, 0);
});

/* ------------------------- Los nombres de la API --------------------------- */

test("el parecido viaja con el nombre que espera la API", () => {
  // Se llama `similarity_boost`; `similarity` a secas se ignora sin avisar.
  const body = toApi(findVoicePreset("cercano").settings);

  assert.equal(body.similarity_boost, 0.75);
  assert.equal(body.similarity, undefined);
  assert.equal(body.use_speaker_boost, true);
  assert.equal(body.speakerBoost, undefined);
});

test("lo que va a la API ya viene recortado", () => {
  assert.equal(toApi({ ...findVoicePreset("cercano").settings, speed: 9 }).speed, 1.2);
});

/* ------------------------------- El aviso ---------------------------------- */

test("avisa cuando dos tomas seguidas van a sonar a personas distintas", () => {
  // Cada toma se genera por separado: con la estabilidad muy baja el salto se
  // oye en el montaje.
  assert.equal(driftsBetweenShots({ ...findVoicePreset("cercano").settings, stability: 0.2 }), true);
  assert.equal(driftsBetweenShots(findVoicePreset("cercano").settings), false);
  assert.equal(driftsBetweenShots(findVoicePreset("narrador").settings), false);
});
