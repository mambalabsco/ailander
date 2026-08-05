import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_SECONDS,
  closeGaps,
  moveClip,
  problemsOf,
  removeClip,
  round,
  splitAt,
  toComposeTracks,
  totalSeconds,
  trackOf,
  trimClip,
  type Clip,
  type Timeline,
} from "./timeline-edit.ts";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  url: "https://v/1.mp4",
  kind: "video",
  sourceSeconds: 10,
  inPoint: 0,
  duration: 6,
  start: 0,
  ...over,
});

const line = (...clips: Clip[]): Timeline => ({ clips });

/* --------------------------------- Medidas --------------------------------- */

test("redondear evita el fotograma negro entre dos planos", () => {
  /*
   * `0.1 + 0.2` no da `0.3`. Sin redondear, dos cortes que deberían coincidir
   * salen a un milisegundo de distancia — y ese milisegundo es negro.
   */
  assert.equal(round(0.1 + 0.2), 0.3);
  assert.equal(round(1 / 3), 0.333);
});

test("un número imposible se queda en cero, no en NaN", () => {
  // Un NaN en un `timestamp` no da error: el montador lo interpreta como pueda.
  assert.equal(round(Number.NaN), 0);
  assert.equal(round(Number.POSITIVE_INFINITY), 0);
});

test("la duración la marca la imagen, no la pista más larga", () => {
  /*
   * Estirar el vídeo hasta donde llega la voz no repite el último fotograma:
   * pone negro. Es la misma regla que ya usa el montaje del flujo.
   */
  const timeline = line(
    clip({ id: "v1", duration: 6 }),
    clip({ id: "voz", kind: "voz", duration: 20, sourceSeconds: 20 }),
  );

  assert.equal(totalSeconds(timeline), 6);
});

test("sin imagen no hay montaje que durar", () => {
  assert.equal(totalSeconds(line(clip({ kind: "voz" }))), 0);
});

test("una pista sale en el orden en que suena, no en el de la lista", () => {
  const timeline = line(clip({ id: "b", start: 6 }), clip({ id: "a", start: 0 }));

  assert.deepEqual(
    trackOf(timeline, "video").map((item) => item.id),
    ["a", "b"],
  );
});

/* --------------------------------- Mover ----------------------------------- */

test("un clip no puede empezar antes de cero", () => {
  // El montador recorta lo que quede en negativo, así que el vídeo empezaría por
  // la mitad de ese plano sin que nada lo dijera.
  const moved = moveClip(line(clip()), "c1", -3);

  assert.equal(moved.clips[0].start, 0);
});

/* -------------------------------- Recortar --------------------------------- */

test("no se puede pedir más de lo que dura el archivo", () => {
  /*
   * Pedir de más no da error: el montador rellena con negro si es imagen y con
   * silencio si es audio, y eso se descubre viendo el resultado.
   */
  const cut = trimClip(line(clip({ sourceSeconds: 10 })), "c1", { duration: 30 });

  assert.equal(cut.clips[0].duration, 10);
});

test("recortar por el principio deja menos sitio por el final", () => {
  const cut = trimClip(line(clip({ sourceSeconds: 10 })), "c1", { inPoint: 7, duration: 6 });

  assert.equal(cut.clips[0].inPoint, 7);
  assert.equal(cut.clips[0].duration, 3);
});

test("nunca queda un clip de duración cero", () => {
  // Existe en la lista, no se ve, y no hay forma de agarrarlo para borrarlo.
  const cut = trimClip(line(clip()), "c1", { duration: 0 });

  assert.equal(cut.clips[0].duration, MIN_SECONDS);
});

test("sin saber lo que dura el archivo se deja pasar lo que se pida", () => {
  /*
   * Inventar un tope recortaría un plano que sí existía. Cero es «no se sabe»,
   * y no es lo mismo que «dura cero».
   */
  const cut = trimClip(line(clip({ sourceSeconds: 0 })), "c1", { duration: 45 });

  assert.equal(cut.clips[0].duration, 45);
});

test("el punto de entrada no se pasa del archivo", () => {
  const cut = trimClip(line(clip({ sourceSeconds: 10 })), "c1", { inPoint: 99 });

  assert.ok(cut.clips[0].inPoint <= 10);
  assert.ok(cut.clips[0].duration >= MIN_SECONDS);
});

/* --------------------------------- Partir ---------------------------------- */

test("el segundo trozo arranca el archivo donde lo dejó el primero", () => {
  /*
   * Si empezara de cero, la segunda mitad repetiría el principio del plano y
   * quedaría un salto que parece un fallo del modelo.
   */
  const split = splitAt(line(clip({ duration: 6, inPoint: 2 })), "c1", 4);
  const [left, right] = trackOf(split, "video");

  assert.equal(left.duration, 4);
  assert.equal(right.start, 4);
  assert.equal(right.inPoint, 6);
  assert.equal(right.duration, 2);
});

test("partir fuera del clip no hace nada", () => {
  // Devolver un trozo vacío sí rompe; no partir, no.
  const before = line(clip({ start: 0, duration: 6 }));

  assert.equal(splitAt(before, "c1", 20).clips.length, 1);
  assert.equal(splitAt(before, "c1", 0).clips.length, 1);
});

test("partir un clip que no existe deja todo igual", () => {
  const before = line(clip());

  assert.deepEqual(splitAt(before, "otro", 3), before);
});

/* ------------------------------- Cerrar huecos ------------------------------ */

test("al borrar del medio, lo de detrás sube", () => {
  const timeline = line(
    clip({ id: "a", start: 0, duration: 4 }),
    clip({ id: "b", start: 4, duration: 4 }),
    clip({ id: "c", start: 8, duration: 4 }),
  );

  const closed = closeGaps(removeClip(timeline, "b"), "video");

  assert.deepEqual(
    trackOf(closed, "video").map((item) => [item.id, item.start]),
    [
      ["a", 0],
      ["c", 4],
    ],
  );
});

test("cerrar huecos no reordena el anuncio", () => {
  /*
   * La lista puede venir en cualquier orden. Reordenar por eso sería cambiar el
   * anuncio sin que nadie lo pidiera.
   */
  const timeline = line(
    clip({ id: "segundo", start: 10, duration: 2 }),
    clip({ id: "primero", start: 0, duration: 2 }),
  );

  assert.deepEqual(
    trackOf(closeGaps(timeline, "video"), "video").map((item) => item.id),
    ["primero", "segundo"],
  );
});

test("cerrar una pista no mueve las otras", () => {
  const timeline = line(
    clip({ id: "v", start: 5, duration: 2 }),
    clip({ id: "m", kind: "musica", start: 5, duration: 2 }),
  );

  const closed = closeGaps(timeline, "video");

  assert.equal(trackOf(closed, "video")[0].start, 0);
  assert.equal(trackOf(closed, "musica")[0].start, 5);
});

/* -------------------------------- Los avisos ------------------------------- */

test("avisa de lo que se pasa del final del archivo", () => {
  const timeline = line(clip({ sourceSeconds: 5, inPoint: 3, duration: 6 }));

  assert.match(problemsOf(timeline)[0].problem, /más de los que tiene el archivo/);
});

test("avisa de dos planos pisándose", () => {
  // El montador enseña uno de los dos y no dice cuál: al ver el vídeo parece
  // que falta una toma, y en la línea de tiempo están las dos.
  const timeline = line(
    clip({ id: "a", start: 0, duration: 6 }),
    clip({ id: "b", start: 4, duration: 6, sourceSeconds: 10 }),
  );

  assert.ok(problemsOf(timeline).some((item) => /Se pisa con «a»/.test(item.problem)));
});

test("avisa del negro entre dos planos y del negro del principio", () => {
  const timeline = line(
    clip({ id: "a", start: 1, duration: 4 }),
    clip({ id: "b", start: 6, duration: 4 }),
  );

  const problems = problemsOf(timeline).map((item) => item.problem);

  assert.ok(problems.some((text) => /empieza con 1\.00 s de negro/.test(text)));
  assert.ok(problems.some((text) => /1\.00 s de negro antes/.test(text)));
});

test("un montaje bien hecho no tiene nada que avisar", () => {
  const timeline = line(
    clip({ id: "a", start: 0, duration: 6 }),
    clip({ id: "b", start: 6, duration: 4, sourceSeconds: 10 }),
    clip({ id: "voz", kind: "voz", start: 0, duration: 10, sourceSeconds: 10 }),
  );

  assert.deepEqual(problemsOf(timeline), []);
});

test("un hueco de milésimas no se cuenta como negro", () => {
  // Redondeos de un milisegundo no son un problema de montaje: llenar la
  // pantalla de avisos que no importan hace que no se lea ninguno.
  const timeline = line(
    clip({ id: "a", start: 0, duration: 4 }),
    clip({ id: "b", start: 4.01, duration: 4 }),
  );

  assert.deepEqual(problemsOf(timeline), []);
});

/* ---------------------------- Hacia el montador ---------------------------- */

test("cada clip va en su propia pista", () => {
  /*
   * Con varios en la misma, el montador se quedaba con el último y lo repetía
   * hasta el final del audio. Está documentado en `timeline.ts` y costó varias
   * vueltas descubrirlo.
   */
  const timeline = line(
    clip({ id: "a", start: 0, duration: 4 }),
    clip({ id: "b", start: 4, duration: 4 }),
  );

  const { tracks } = toComposeTracks(timeline);

  assert.equal(tracks.length, 2);
  assert.ok(tracks.every((track) => track.keyframes.length === 1));
});

test("los tiempos salen en milisegundos enteros", () => {
  const { tracks } = toComposeTracks(line(clip({ start: 1.5, duration: 2.25 })));

  assert.equal(tracks[0].keyframes[0].timestamp, 1500);
  assert.equal(tracks[0].keyframes[0].duration, 2250);
});

test("un clip recortado por el principio se devuelve aparte", () => {
  /*
   * El formato del montador no tiene dónde decir por qué punto del archivo
   * empieza. Mandarlo tal cual daría un vídeo que dura lo correcto y va
   * desincronizado justo por lo que se había recortado.
   */
  const { needsTrim } = toComposeTracks(
    line(clip({ id: "recortado", inPoint: 2 }), clip({ id: "entero", start: 6, inPoint: 0 })),
  );

  assert.deepEqual(
    needsTrim.map((item) => item.id),
    ["recortado"],
  );
});

test("la voz y la música salen como audio", () => {
  const { tracks } = toComposeTracks(
    line(
      clip({ id: "v" }),
      clip({ id: "voz", kind: "voz", duration: 6 }),
      clip({ id: "mus", kind: "musica", duration: 6 }),
    ),
  );

  assert.deepEqual(
    tracks.map((track) => track.type),
    ["video", "audio", "audio"],
  );
});
