import assert from "node:assert/strict";
import { test } from "node:test";

import { createCache } from "./ttl-cache.ts";

/** Un reloj que se mueve a mano, para no esperar cinco minutos en una prueba. */
function clock(start = 0) {
  let value = start;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

test("la segunda vez no vuelve a preguntar", () => {
  const cache = createCache();
  let calls = 0;

  return Promise.all([
    cache.get("k", async () => ++calls),
    cache.get("k", async () => ++calls),
  ]).then(async () => {
    await cache.get("k", async () => ++calls);
    assert.equal(calls, 1);
  });
});

/*
 * Al abrir la pantalla se piden a la vez el estado del CLI y dos catálogos. Sin
 * compartir la llamada en vuelo, tres pestañas abiertas lanzan doce procesos en
 * vez de cuatro.
 */
test("las llamadas a la vez comparten una sola respuesta", async () => {
  const cache = createCache();
  let calls = 0;

  const slow = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "listo";
  };

  const [a, b, c] = await Promise.all([
    cache.get("k", slow),
    cache.get("k", slow),
    cache.get("k", slow),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual([a, b, c], ["listo", "listo", "listo"]);
});

test("pasado el plazo se vuelve a preguntar", async () => {
  const time = clock();
  const cache = createCache({ okMs: 1000, now: time.now });
  let calls = 0;

  await cache.get("k", async () => ++calls);
  time.advance(999);
  await cache.get("k", async () => ++calls);
  assert.equal(calls, 1);

  time.advance(2);
  await cache.get("k", async () => ++calls);
  assert.equal(calls, 2);
});

test("cada clave va por su cuenta", async () => {
  const cache = createCache();

  assert.equal(await cache.get("a", async () => "uno"), "uno");
  assert.equal(await cache.get("b", async () => "dos"), "dos");
  assert.equal(cache.size(), 2);
});

/* --------------------------------- Fallos ---------------------------------- */

test("un fallo se propaga, no se devuelve como bueno", async () => {
  const cache = createCache();

  await assert.rejects(
    cache.get("k", async () => {
      throw new Error("no va");
    }),
    /no va/,
  );
});

/*
 * Quien acaba de arreglar la sesión entra a mirar **enseguida**. Cachear un
 * fallo cinco minutos es el peor momento posible; medio minuto no repite la
 * llamada en cada clic y no desespera.
 */
test("un fallo se guarda menos rato que un acierto", async () => {
  const time = clock();
  const cache = createCache({ okMs: 5000, failMs: 100, now: time.now });
  let calls = 0;

  const failing = async () => {
    calls += 1;
    throw new Error("no va");
  };

  await assert.rejects(cache.get("k", failing));

  // Dentro del plazo corto no se reintenta.
  time.advance(50);
  await assert.rejects(cache.get("k", failing));
  assert.equal(calls, 1);

  // Pasado, sí.
  time.advance(60);
  await assert.rejects(cache.get("k", failing));
  assert.equal(calls, 2);
});

test("después de un fallo, un acierto se guarda con su plazo largo", async () => {
  const time = clock();
  const cache = createCache({ okMs: 5000, failMs: 100, now: time.now });
  let calls = 0;

  await assert.rejects(
    cache.get("k", async () => {
      calls += 1;
      throw new Error("no va");
    }),
  );

  time.advance(200);
  assert.equal(await cache.get("k", async () => (calls += 1)), 2);

  time.advance(1000);
  await cache.get("k", async () => (calls += 1));
  assert.equal(calls, 2, "el acierto tiene que durar más que el fallo");
});

test("olvidar una clave la vuelve a preguntar", async () => {
  const cache = createCache();
  let calls = 0;

  await cache.get("k", async () => ++calls);
  cache.forget("k");
  await cache.get("k", async () => ++calls);

  assert.equal(calls, 2);
});
