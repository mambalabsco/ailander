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

test("una toma sin clip no deja hueco: la anterior se estira por encima", () => {
  /*
   * La que falta no adelanta a las demás.
   *
   * Antes las tomas se pegaban una detrás de otra, así que una que faltara
   * adelantaba todo lo que venía después y el vídeo se descuadraba de la voz.
   * Ahora la primera se estira hasta que arranca la tercera —que sigue en su
   * segundo real— y lo que se oye sigue coincidiendo con lo que se ve.
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

  assert.equal(result.tracks[0].keyframes[0].duration, 6000, "la primera cubre el hueco");
  assert.equal(result.tracks[0].keyframes[1].timestamp, 6000, "la tercera sigue en su sitio");
  assert.equal(result.seconds, 9);
});

test("cada toma cae en el segundo en que empieza su frase", () => {
  /*
   * Este es el fallo que descuadraba el vídeo entero. Los cortes no se tocan
   * entre sí —hay silencio entre frases— y pegando las tomas se ignoraban esos
   * huecos: la imagen se adelantaba un poco más en cada corte, así que el
   * desajuste **crecía** según avanzaba el vídeo.
   */
  const result = buildTimeline({
    cuts: [
      { n: "01", start: 0.5, end: 3 },
      { n: "02", start: 3.4, end: 6 },
      { n: "03", start: 6.5, end: 9 },
    ],
    clips: { "01": "https://cdn/1.mp4", "02": "https://cdn/2.mp4", "03": "https://cdn/3.mp4" },
    voiceUrl: VOZ,
  });

  const [uno, dos, tres] = result.tracks[0].keyframes;

  // La primera empieza en cero aunque su frase entre en el 0,5: ese arranque
  // tiene que verse.
  assert.equal(uno.timestamp, 0);
  assert.equal(dos.timestamp, 3400);
  assert.equal(tres.timestamp, 6500);

  // Y cada una llega hasta que arranca la siguiente: sin huecos en negro.
  assert.equal(uno.duration, 3400);
  assert.equal(dos.duration, 3100);
  assert.equal(result.seconds, 9);
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

test("dos cortes que se pisan no dejan un clip tapando al otro", () => {
  /*
   * Solo se ve uno de los dos, así que el vídeo se queda con una escena colgada
   * mientras la voz habla de otra cosa. Y no se nota que falta una toma: se nota
   * que la de al lado dura de más.
   */
  const result = buildTimeline({
    cuts: [
      { n: "01", start: 0, end: 4 },
      { n: "02", start: 2, end: 6 },
    ],
    clips: { "01": "https://cdn/1.mp4", "02": "https://cdn/2.mp4" },
    voiceUrl: VOZ,
  });

  const [uno, dos] = result.tracks[0].keyframes;

  assert.equal(uno.timestamp + uno.duration, dos.timestamp, "no se solapan");
  assert.equal(result.tracks[0].keyframes.length, 2, "ninguna se cae");
});

test("los cortes desordenados se colocan igual", () => {
  // De su orden depende todo lo demás: uno fuera de sitio da duración negativa
  // y esa toma se cae sin que nada avise.
  const result = buildTimeline({
    cuts: [
      { n: "02", start: 4, end: 8 },
      { n: "01", start: 0, end: 4 },
    ],
    clips: { "01": "https://cdn/1.mp4", "02": "https://cdn/2.mp4" },
    voiceUrl: VOZ,
  });

  assert.equal(result.tracks[0].keyframes.length, 2);
  assert.deepEqual(
    result.tracks[0].keyframes.map((frame) => frame.url),
    ["https://cdn/1.mp4", "https://cdn/2.mp4"],
  );
});

test("la última toma se estira hasta que se calla la voz: nunca queda negro", () => {
  /*
   * La imagen acababa con el último corte y la voz seguía sonando: todo ese rato
   * quedaba a oscuras. Con la mayoría de tomas sin tiempos, «ese rato» era casi
   * el vídeo entero — se veía el primer clip y después negro.
   */
  const result = buildTimeline({
    cuts: [{ n: "01", start: 0, end: 4 }],
    clips: { "01": "https://cdn/1.mp4" },
    voiceUrl: VOZ,
    voiceSeconds: 30,
  });

  const [uno] = result.tracks[0].keyframes;

  assert.equal(uno.duration, 30000, "cubre toda la voz");
  assert.equal(result.seconds, 30);

  const audio = result.tracks.find((track) => track.id === "voz");
  assert.equal(audio?.keyframes[0].duration, 30000, "y la voz suena entera");
});

test("dos tomas no pueden acabar apuntando al mismo clip", () => {
  /*
   * Era la causa de que el montaje repitiera un plano de principio a fin. El
   * mapa de clips se indexa por el número de toma, y ese número lo ponía el
   * modelo: con uno repetido, `Object.fromEntries` se queda con el último y
   * todas las tomas resuelven a ese mismo vídeo.
   *
   * Ahora el número lo pone la posición, así que la colisión no puede ocurrir.
   * Esta prueba fija lo que se espera: cada corte, su clip.
   */
  const result = buildTimeline({
    cuts: [
      { n: "01", start: 0, end: 3 },
      { n: "02", start: 3, end: 6 },
      { n: "03", start: 6, end: 9 },
    ],
    clips: {
      "01": "https://cdn/1.mp4",
      "02": "https://cdn/2.mp4",
      "03": "https://cdn/3.mp4",
    },
    voiceUrl: VOZ,
  });

  const urls = result.tracks[0].keyframes.map((frame) => frame.url);

  assert.deepEqual(urls, ["https://cdn/1.mp4", "https://cdn/2.mp4", "https://cdn/3.mp4"]);
  assert.equal(new Set(urls).size, 3, "ningún clip se repite");
});
