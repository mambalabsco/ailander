import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anchorNote,
  anchorWaves,
  planAnchors,
  showsOther,
  showsPerson,
  type AnchorShot,
} from "./anchors.ts";

const shot = (n: string, partial: Partial<AnchorShot> = {}): AnchorShot => ({
  n,
  scene: "",
  motion: "",
  guion: "",
  ...partial,
});

/* ------------------------------- Quién sale --------------------------------- */

test("una escena con persona se reconoce en los dos idiomas", () => {
  assert.equal(showsPerson(shot("01", { scene: "a woman sitting by the window" })), true);
  assert.equal(showsPerson(shot("02", { scene: "una mujer bajando escaleras" })), true);
});

test("un plano de objeto no lleva a nadie", () => {
  assert.equal(showsPerson(shot("03", { scene: "the bottle on marble, morning light" })), false);
  assert.equal(showsPerson(shot("04", { scene: "pasillo de hospital vacío" })), false);
});

/* El papel manda sobre las palabras: un testimonio es una persona, se describa como se describa. */
test("el papel de la toma también cuenta", () => {
  assert.equal(showsPerson(shot("05", { role: "testimonio" })), true);
  assert.equal(showsPerson(shot("06", { role: "avatar" })), true);
});

test("las palabras de otra persona se detectan", () => {
  assert.equal(showsOther(shot("07", { guion: "su marido no se lo creía" })), true);
  assert.equal(showsOther(shot("08", { scene: "la doctora revisa la analítica" })), true);
  assert.equal(showsOther(shot("09", { scene: "another woman in the gym" })), true);
});

test("hablar de uno mismo no es otra persona", () => {
  assert.equal(showsOther(shot("10", { guion: "yo ya no podía con las rodillas" })), false);
});

/* --------------------------------- El plan ---------------------------------- */

/*
 * Doce imágenes bonitas y doce mundos distintos: la misma mujer rubia en la dos,
 * morena en la cinco. Cada una está bien; no son del mismo anuncio.
 */
test("la persona que vuelve se ancla a la primera vez que salió", () => {
  const plan = planAnchors([
    shot("01", { scene: "una mujer se despierta" }),
    shot("02", { scene: "el frasco sobre la mesa" }),
    shot("03", { scene: "la mujer camina por la calle" }),
    shot("04", { scene: "la mujer sonríe a cámara" }),
  ]);

  assert.equal(plan[0].from, "");
  assert.equal(plan[1].from, "");
  assert.equal(plan[2].from, "01");
  assert.equal(plan[3].from, "01");
});

/*
 * Encadenar cada una con la anterior arrastra: si la tres se desvía, la cuatro
 * hereda ese desvío y al final la persona ya no se parece a la del principio.
 */
test("todas se anclan a la primera, no en cadena", () => {
  const plan = planAnchors(
    ["01", "02", "03", "04"].map((n) => shot(n, { scene: "una mujer" })),
  );

  assert.deepEqual(
    plan.map((item) => item.from),
    ["", "01", "01", "01"],
  );
});

/*
 * Anclar a la protagonista una toma que habla del marido daría dos personajes
 * con la misma cara, que es peor que dos caras para el mismo.
 */
test("otra persona abre su propio grupo", () => {
  const plan = planAnchors([
    shot("01", { scene: "una mujer en la cocina" }),
    shot("02", { scene: "su marido la mira", guion: "su marido no se lo creía" }),
    shot("03", { scene: "la mujer sale a andar" }),
  ]);

  assert.equal(plan[1].group, "otro:marido");
  assert.equal(plan[1].from, "");
  assert.equal(plan[2].from, "01");
});

test("la misma otra persona que vuelve también se ancla a la suya", () => {
  const plan = planAnchors([
    shot("01", { scene: "una mujer" }),
    shot("02", { scene: "la doctora explica" }),
    shot("03", { scene: "la doctora señala la pantalla" }),
  ]);

  assert.equal(plan[2].from, "02");
  assert.equal(plan[2].group, plan[1].group);
});

/*
 * Mandarle la foto de la mujer a un plano del envase solo le da una razón para
 * meterla en el encuadre, que es justo lo que no se quiere.
 */
test("las tomas sin gente no llevan ancla", () => {
  const plan = planAnchors([
    shot("01", { scene: "una mujer" }),
    shot("02", { scene: "the bottle on marble" }),
  ]);

  assert.equal(plan[1].group, "");
  assert.equal(plan[1].from, "");
  assert.match(plan[1].why, /No sale nadie/);
});

test("cada ancla dice por qué está donde está", () => {
  for (const item of planAnchors([shot("01", { scene: "una mujer" }), shot("02", { scene: "ella" })])) {
    assert.ok(item.why.length > 10, item.n);
  }
});

test("un guion vacío no revienta el plan", () => {
  assert.deepEqual(planAnchors([]), []);
});

/* -------------------------------- La nota ----------------------------------- */

/*
 * Sin la segunda mitad —qué no copiar— el generador copia también el encuadre y
 * salen dos tomas iguales.
 */
test("la nota dice qué mirar y qué no copiar", () => {
  const nota = anchorNote({ n: "03", group: "principal", from: "01", why: "" }, 2);

  assert.match(nota, /second reference image/);
  assert.match(nota, /same face/);
  assert.match(nota, /do not copy its framing/);
});

test("la toma que manda no lleva nota", () => {
  assert.equal(anchorNote({ n: "01", group: "principal", from: "", why: "" }, 1), "");
});

test("la posición se dice en palabras, que es como las cuenta el modelo", () => {
  assert.match(anchorNote({ n: "02", group: "a", from: "01", why: "" }, 1), /first/);
  assert.match(anchorNote({ n: "02", group: "a", from: "01", why: "" }, 3), /third/);
});

/* -------------------------------- El orden ---------------------------------- */

/* Una toma no puede recibir una imagen que todavía no existe. */
test("las anclas se generan antes que las que heredan", () => {
  const plan = planAnchors([
    shot("01", { scene: "una mujer" }),
    shot("02", { scene: "el frasco" }),
    shot("03", { scene: "la mujer otra vez" }),
  ]);

  const waves = anchorWaves(plan);

  assert.deepEqual(waves[0], ["01", "02"]);
  assert.deepEqual(waves[1], ["03"]);
});

/* Sin herederas no hay motivo para dos vueltas: todo sale a la vez. */
test("sin nada que heredar va todo en una oleada", () => {
  const plan = planAnchors([shot("01", { scene: "el frasco" }), shot("02", { scene: "un pasillo" })]);

  assert.equal(anchorWaves(plan).length, 1);
  assert.deepEqual(anchorWaves(plan)[0], ["01", "02"]);
});

test("ninguna toma se pierde entre oleadas", () => {
  const plan = planAnchors(
    ["01", "02", "03", "04", "05"].map((n) => shot(n, { scene: "una mujer" })),
  );

  assert.deepEqual(anchorWaves(plan).flat().sort(), ["01", "02", "03", "04", "05"]);
});
