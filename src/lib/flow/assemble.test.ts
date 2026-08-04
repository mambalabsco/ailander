import assert from "node:assert/strict";
import { test } from "node:test";

import { composeTracks, planAssembly } from "./assemble.ts";

const clip = (id: string, seconds = 6, url = `https://x.co/${id}.mp4`) => ({ id, url, seconds });

/* --------------------------- Lo que impide montar -------------------------- */

test("sin planos no se monta", () => {
  const plan = planAssembly({ clips: [] });

  assert.ok(plan.blockers.length > 0);
});

/*
 * El síntoma exacto del fallo que costó varias vueltas: el vídeo salía
 * repitiendo un plano de principio a fin, y desde fuera parecía un montaje roto
 * cuando lo que venía repetido eran los archivos.
 */
test("varios planos que son el mismo archivo se bloquean", () => {
  const plan = planAssembly({
    clips: [clip("a", 6, "https://x.co/mismo.mp4"), clip("b", 6, "https://x.co/mismo.mp4")],
  });

  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /el mismo archivo/);
});

test("un plano repetido entre muchos avisa pero no bloquea", () => {
  // Con seis planos y dos iguales puede ser a propósito; con dos iguales de dos,
  // no hay montaje que hacer.
  const plan = planAssembly({
    clips: [clip("a"), clip("b"), clip("c"), clip("d", 6, "https://x.co/c.mp4")],
  });

  assert.deepEqual(plan.blockers, []);
  assert.ok(plan.warnings.some((warning) => warning.includes("repetidos")));
});

test("un plano suelto repetido no existe: uno solo nunca bloquea", () => {
  assert.deepEqual(planAssembly({ clips: [clip("a")] }).blockers, []);
});

/* ---------------------------- Las duraciones ------------------------------- */

test("el vídeo dura lo que suman los planos", () => {
  const plan = planAssembly({ clips: [clip("a", 6), clip("b", 4)] });

  assert.equal(plan.seconds, 10);
});

/*
 * Cero es «no se sabe», no «dura cero». Confundirlos deja un plano de duración
 * nula, o sea un plano que desaparece del montaje.
 */
test("un plano sin duración conocida entra entero y se avisa", () => {
  const plan = planAssembly({ clips: [clip("a", 6), clip("b", 0)] });

  assert.equal(plan.seconds, 6);
  assert.ok(plan.warnings.some((warning) => warning.includes("no se sabe la duración")));
  assert.deepEqual(plan.blockers, []);
});

test("sin ninguna duración conocida y sin voz, no hay montaje posible", () => {
  const plan = planAssembly({ clips: [clip("a", 0)] });

  assert.ok(plan.blockers.some((blocker) => blocker.includes("cuánto dura")));
});

test("sin planos con duración pero con voz, manda la voz", () => {
  const plan = planAssembly({
    clips: [clip("a", 0)],
    voice: { id: "v", url: "https://x.co/v.mp3", seconds: 12 },
  });

  assert.equal(plan.seconds, 12);
});

/*
 * Estirar la pista hasta la voz es lo que dejaba **cola negra**: el montador no
 * repite el último fotograma, pone negro. Así que manda la imagen y se dice
 * cuánta voz sobra.
 */
test("con la voz más larga que la imagen, manda la imagen y se avisa", () => {
  const plan = planAssembly({
    clips: [clip("a", 10)],
    voice: { id: "v", url: "https://x.co/v.mp3", seconds: 18 },
  });

  assert.equal(plan.seconds, 10);
  assert.ok(plan.warnings.some((warning) => warning.includes("se cortarán 8.0 s")));
});

test("medio segundo de diferencia no es un aviso", () => {
  // Los generadores entregan 5,8 donde se pidieron 6: avisar de eso enseña a
  // ignorar los avisos.
  const plan = planAssembly({
    clips: [clip("a", 10)],
    voice: { id: "v", url: "https://x.co/v.mp3", seconds: 10.3 },
  });

  assert.equal(plan.warnings.length, 0);
});

test("con la imagen mucho más larga que la voz, se dice que el final va mudo", () => {
  const plan = planAssembly({
    clips: [clip("a", 20)],
    voice: { id: "v", url: "https://x.co/v.mp3", seconds: 8 },
  });

  assert.ok(plan.warnings.some((warning) => warning.includes("sin locución")));
});

test("la música corta se avisa, no se estira", () => {
  const plan = planAssembly({
    clips: [clip("a", 30)],
    music: { id: "m", url: "https://x.co/m.wav", seconds: 10 },
  });

  assert.ok(plan.warnings.some((warning) => warning.includes("sin música")));
});

test("una música de sobra no molesta", () => {
  const plan = planAssembly({
    clips: [clip("a", 10)],
    music: { id: "m", url: "https://x.co/m.wav", seconds: 30 },
  });

  assert.equal(plan.warnings.length, 0);
});

/* ------------------------------ Las pistas --------------------------------- */

/*
 * Un solo fotograma de vídeo con los planos ya encadenados. Es el arreglo del
 * fallo de raíz: pasarle los planos sueltos al montador para que los colocara
 * devolvía el último repetido de principio a fin.
 */
test("la pista de vídeo lleva un solo fotograma", () => {
  const plan = planAssembly({ clips: [clip("a", 6), clip("b", 4)] });
  const tracks = composeTracks(plan, "https://x.co/todo.mp4");

  const video = tracks.find((track) => track.type === "video")!;

  assert.equal(video.keyframes.length, 1);
  assert.equal(video.keyframes[0].url, "https://x.co/todo.mp4");
});

test("las tres pistas empiezan a la vez y duran lo mismo", () => {
  const plan = planAssembly({
    clips: [clip("a", 10)],
    voice: { id: "v", url: "https://x.co/v.mp3", seconds: 10 },
    music: { id: "m", url: "https://x.co/m.wav", seconds: 30 },
  });

  const tracks = composeTracks(plan, "https://x.co/todo.mp4");

  assert.equal(tracks.length, 3);
  assert.ok(tracks.every((track) => track.keyframes[0].timestamp === 0));
  assert.ok(tracks.every((track) => track.keyframes[0].duration === 10_000));
});

test("sin voz ni música solo va la imagen", () => {
  const plan = planAssembly({ clips: [clip("a", 6)] });

  assert.equal(composeTracks(plan, "https://x.co/todo.mp4").length, 1);
});

test("una voz sin dirección no cuenta como voz", () => {
  const plan = planAssembly({ clips: [clip("a", 6)], voice: { id: "v", url: "", seconds: 10 } });

  assert.equal(plan.voice, null);
  assert.equal(composeTracks(plan, "https://x.co/todo.mp4").length, 1);
});
