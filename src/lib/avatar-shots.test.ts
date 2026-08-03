import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPersonPrompt,
  buildShotPrompt,
  CONTEXTS,
  contextsFor,
  findContext,
  findPerson,
  PEOPLE,
  tally,
  USD_PER_IMAGE,
} from "./avatar-shots.ts";

/* ------------------------------ Los contextos ------------------------------ */

test("cada contexto dice para qué sirve, no solo dónde es", () => {
  // Quien elige tiene que saber qué está eligiendo: una foto en el baño y otra
  // en el gimnasio cuentan cosas distintas del producto.
  for (const context of CONTEXTS) {
    assert.ok(context.note.length > 15, `${context.id} sin explicar`);
    assert.ok(context.scene.length > 30, `${context.id} sin escena`);
  }
});

test("no hay contextos repetidos", () => {
  assert.equal(new Set(CONTEXTS.map((context) => context.id)).size, CONTEXTS.length);
});

/*
 * Pedir «cinco fotos variadas» devuelve cinco veces la misma cocina: la
 * variedad hay que nombrarla.
 */
test("las fotos de una tanda no repiten contexto hasta agotarlos", () => {
  const ids = contextsFor(5).map((context) => context.id);

  assert.equal(new Set(ids).size, 5);
});

test("pidiendo más que contextos hay, se vuelve a empezar", () => {
  const ids = contextsFor(CONTEXTS.length + 2).map((context) => context.id);

  assert.equal(ids.length, CONTEXTS.length + 2);
  assert.equal(ids[CONTEXTS.length], ids[0]);
});

test("se pueden elegir los contextos a mano", () => {
  const ids = contextsFor(4, ["bano", "coche"]).map((context) => context.id);

  assert.deepEqual(ids, ["bano", "coche", "bano", "coche"]);
});

test("pedir cero fotos da una, no ninguna", () => {
  // Cero es un número que sale de un campo vacío, no una intención.
  assert.equal(contextsFor(0).length, 1);
});

test("un contexto desconocido no revienta", () => {
  assert.equal(findContext("no-existe").id, CONTEXTS[0].id);
});

/* ------------------------------- El encargo -------------------------------- */

/*
 * Las dos cosas que deciden si la tanda sirve, y las dos son de encargo:
 * que sea la misma persona en las cinco fotos, y que el envase sea el de verdad.
 */
test("el encargo dice cuál imagen es la cara y cuál el producto", () => {
  const prompt = buildShotPrompt({ scene: "in a kitchen", productName: "Naturox" });

  assert.match(prompt, /FIRST reference image/);
  assert.match(prompt, /SECOND reference image/);
  assert.match(prompt, /same person/i);
});

test("el envase no se puede rediseñar", () => {
  // Un bote «parecido» pasa la primera mirada y no la segunda, con la tanda ya
  // pagada.
  const prompt = buildShotPrompt({ scene: "x", productName: "Naturox" });

  assert.match(prompt, /Reproduce its packaging exactly/);
  assert.match(prompt, /do not invent a different container/i);
});

test("el producto va en la mano salvo que se diga otra cosa", () => {
  assert.match(buildShotPrompt({ scene: "x", productName: "y" }), /holding the product/);
  assert.match(
    buildShotPrompt({ scene: "x", productName: "y", holding: false }),
    /sits in the scene/,
  );
});

test("la descripción de la persona entra si la hay", () => {
  const prompt = buildShotPrompt({ scene: "x", productName: "y", person: "a woman in her 40s" });

  assert.match(prompt, /She is a woman in her 40s/);
});

test("siempre pide que parezca una foto de móvil", () => {
  // Sin esto sale una foto de catálogo, y una foto de catálogo con una persona
  // dentro sigue siendo un anuncio de marca.
  const prompt = buildShotPrompt({ scene: "x", productName: "y" });

  assert.match(prompt, /phone camera/);
  assert.match(prompt, /[Nn]ot a studio photo/);
});

test("la escena pedida viaja entera", () => {
  assert.match(
    buildShotPrompt({ scene: "sitting in a parked car", productName: "y" }),
    /Scene: sitting in a parked car/,
  );
});

/* --------------------------- La persona de partida ------------------------- */

test("las sugerencias son gente normal, no modelos", () => {
  for (const person of PEOPLE) {
    assert.ok(person.description.length > 40, `${person.id} sin describir`);
  }

  assert.equal(new Set(PEOPLE.map((person) => person.id)).size, PEOPLE.length);
});

test("una sugerencia desconocida devuelve nada, no la primera", () => {
  // Aquí no vale caer en la primera: quien escribió su propia descripción no
  // quiere que se la sustituyan por «mujer de 45».
  assert.equal(findPerson("no-existe"), null);
  assert.ok(findPerson("mujer-45"));
});

test("el retrato de partida se pide sin producto y bien iluminado", () => {
  // Esta cara se guarda y se usa como referencia en todas sus fotos: si sale a
  // contraluz, arrastra el fallo a la tanda entera.
  const prompt = buildPersonPrompt({ description: "a woman in her 40s" });

  assert.match(prompt, /reference for other photos/);
  assert.equal(prompt.includes("product"), false);
});

test("el país entra solo si se sabe", () => {
  assert.match(buildPersonPrompt({ description: "x", countryName: "Chile" }), /from Chile/);
  assert.equal(buildPersonPrompt({ description: "x" }).includes("ordinary person from"), false);
});

/* --------------------------------- El coste -------------------------------- */

/*
 * Multiplica, y desde el formulario no se ve: se ven un seis y un cinco.
 */
test("el número de imágenes es el producto de los dos números", () => {
  assert.deepEqual(tally(6, 5), { images: 30, usd: Number((30 * USD_PER_IMAGE).toFixed(2)) });
});

test("sin avatares no hay nada que cobrar", () => {
  assert.deepEqual(tally(0, 5), { images: 0, usd: 0 });
});

test("un número absurdo no da un coste negativo", () => {
  assert.equal(tally(-3, 5).images, 0);
});
