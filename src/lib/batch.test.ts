import assert from "node:assert/strict";
import { test } from "node:test";

import { CONCURRENCY, failures, inBatches, values } from "./batch.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * El orden de entrada es el del montaje: para seis planos de un vídeo, que
 * vuelvan en el orden en que acabaron sería otro vídeo.
 */
test("los resultados vuelven en el orden en que se pidieron", async () => {
  const outcomes = await inBatches([30, 5, 20, 1], async (ms, index) => {
    await wait(ms);
    return index;
  });

  assert.deepEqual(values(outcomes), [0, 1, 2, 3]);
});

test("nunca hay más de las permitidas a la vez", async () => {
  let live = 0;
  let peak = 0;

  await inBatches(
    Array.from({ length: 12 }, (_, i) => i),
    async () => {
      live += 1;
      peak = Math.max(peak, live);
      await wait(5);
      live -= 1;
    },
    { concurrency: 3 },
  );

  assert.equal(peak, 3);
});

test("con menos tareas que el tope no se abren obreros de más", async () => {
  let live = 0;
  let peak = 0;

  await inBatches(
    [1, 2],
    async () => {
      live += 1;
      peak = Math.max(peak, live);
      await wait(5);
      live -= 1;
    },
    { concurrency: 8 },
  );

  assert.equal(peak, 2);
});

/*
 * En una tanda de treinta, que la siete falle no puede tirar las veintitrés que
 * ya salieron —están pagadas— ni impedir las que faltan.
 */
test("lo que falla no tumba lo demás", async () => {
  const outcomes = await inBatches([1, 2, 3, 4], async (n) => {
    if (n === 2) throw new Error("esta no");
    return n * 10;
  });

  assert.deepEqual(values(outcomes), [10, 30, 40]);
  assert.deepEqual(failures(outcomes), [{ index: 1, error: "esta no" }]);
});

test("se dice en qué posición falló, no solo que falló", async () => {
  const outcomes = await inBatches([1, 2, 3], async (n) => {
    if (n === 3) throw new Error("la última");
    return n;
  });

  assert.equal(failures(outcomes)[0].index, 2);
});

/*
 * Repartiendo en bloques de antemano, el obrero que toca las tres lentas acaba
 * mucho después y el tope deja de servir durante la última mitad.
 */
test("un obrero libre coge la siguiente, no espera a los suyos", async () => {
  const started: number[] = [];

  await inBatches(
    [40, 1, 1, 1],
    async (ms, index) => {
      started.push(index);
      await wait(ms);
    },
    { concurrency: 2 },
  );

  // Con reparto en bloques, el 2 y el 3 esperarían al 0. Aquí no.
  assert.deepEqual(started, [0, 1, 2, 3]);
});

test("el avance se cuenta según van acabando", async () => {
  const seen: number[] = [];

  await inBatches(
    [1, 2, 3],
    async (n) => n,
    { concurrency: 1, onDone: (done, total) => seen.push(done / total) },
  );

  assert.deepEqual(seen, [1 / 3, 2 / 3, 1]);
});

test("una lista vacía no hace nada ni revienta", async () => {
  assert.deepEqual(await inBatches([], async () => 1), []);
});

test("un tope absurdo se corrige en vez de colgar", async () => {
  const outcomes = await inBatches([1, 2], async (n) => n, { concurrency: 0 });

  assert.deepEqual(values(outcomes), [1, 2]);
});

test("el tope por defecto es prudente", () => {
  // Los proveedores no publican su límite; descubrirlo con treinta a la vez son
  // treinta errores de cupo, y alguno cobra el intento fallido.
  assert.ok(CONCURRENCY >= 2 && CONCURRENCY <= 6);
});
