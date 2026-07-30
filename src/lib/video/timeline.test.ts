import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTimeline } from "./timeline.ts";

const VOZ = "https://cdn/voz.mp3";

test("cada toma dura lo que su frase, no lo que el clip", () => {
  /*
   * El generador devuelve clips de cinco segundos enteros; la toma dura lo que
   * dura su frase narrada. Colocar el clip completo descuadraría todo lo que
   * viene detrás — es el motivo de que el recorte salga del corte.
   */
  const result = buildTimeline({
    cuts: [
      { n: "01", start: 0, end: 4.2 },
      { n: "02", start: 4.2, end: 7.5 },
    ],
    clips: { "01": "https://cdn/1.mp4", "02": "https://cdn/2.mp4" },
    voiceUrl: VOZ,
  });

  const video = result.tracks.find((track) => track.id === "broll");

  assert.deepEqual(
    video?.keyframes.map((frame) => [frame.timestamp, frame.duration]),
    [
      [0, 4200],
      [4200, 3300],
    ],
  );
  assert.equal(result.seconds, 7.5);
});

test("los tiempos van en milisegundos", () => {
  const result = buildTimeline({
    cuts: [{ n: "01", start: 0, end: 1.234 }],
    clips: { "01": "https://cdn/1.mp4" },
    voiceUrl: VOZ,
  });

  assert.equal(result.tracks[0].keyframes[0].duration, 1234);
});

test("la voz va entera y en un solo trozo", () => {
  /*
   * Cortarla por tomas y volver a pegarla metería un salto en cada unión: los
   * cortes caen entre palabras, pero el silencio de una respiración no es
   * idéntico al de la siguiente y se oye.
   */
  const result = buildTimeline({
    cuts: [
      { n: "01", start: 0, end: 3 },
      { n: "02", start: 3, end: 6 },
    ],
    clips: { "01": "https://cdn/1.mp4", "02": "https://cdn/2.mp4" },
    voiceUrl: VOZ,
  });

  const audio = result.tracks.find((track) => track.id === "voz");

  assert.equal(audio?.keyframes.length, 1);
  assert.equal(audio?.keyframes[0].timestamp, 0);
  assert.equal(audio?.keyframes[0].duration, 6000);
});

test("una toma sin clip se avisa, no deja hueco negro", () => {
  /*
   * Las tomas se pegan en orden en vez de colocarse en su instante original.
   * Así, si una se cae, el vídeo se acorta y sigue viéndose; colocando por
   * tiempo original quedaría un hueco negro en medio.
   */
  const result = buildTimeline({
    cuts: [
      { n: "01", start: 0, end: 3 },
      { n: "02", start: 3, end: 6 },
      { n: "03", start: 6, end: 9 },
    ],
    clips: { "01": "https://cdn/1.mp4", "03": "https://cdn/3.mp4" },
    voiceUrl: VOZ,
  });

  assert.deepEqual(result.missing, ["02"]);
  assert.equal(result.tracks[0].keyframes.length, 2);
  // La tercera arranca donde acabó la primera: no queda hueco.
  assert.equal(result.tracks[0].keyframes[1].timestamp, 3000);
  assert.equal(result.seconds, 6);
});

test("un corte de duración cero se descarta", () => {
  const result = buildTimeline({
    cuts: [{ n: "01", start: 4, end: 4 }],
    clips: { "01": "https://cdn/1.mp4" },
    voiceUrl: VOZ,
  });

  assert.deepEqual(result.missing, ["01"]);
  assert.equal(result.seconds, 0);
});

test("siempre salen las dos pistas, aunque no haya clips", () => {
  const result = buildTimeline({ cuts: [], clips: {}, voiceUrl: VOZ });

  assert.deepEqual(
    result.tracks.map((track) => [track.id, track.type]),
    [
      ["broll", "video"],
      ["voz", "audio"],
    ],
  );
});
