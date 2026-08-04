import assert from "node:assert/strict";
import { test } from "node:test";

import { createQueue, defaultRetryable } from "./queue.ts";

/** Un reloj que avanza solo cuando se duerme, para no esperar de verdad. */
function clock() {
  let value = 0;
  const slept: number[] = [];

  return {
    now: () => value,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
      value += ms;
    },
  };
}

const status = (code: number, retryAfterMs?: number) =>
  Object.assign(new Error(`HTTP ${code}`), { status: code, retryAfterMs });

/* ------------------------------ Qué se reintenta ---------------------------- */

/*
 * Un 400 no: mandar otra vez el mismo cuerpo mal formado da el mismo 400, y
 * reintentarlo cuatro veces solo retrasa el mensaje de error cuarenta segundos.
 */
test("el cupo y los fallos del proveedor se reintentan; lo que está mal, no", () => {
  assert.equal(defaultRetryable(status(429)).retry, true);
  assert.equal(defaultRetryable(status(503)).retry, true);
  assert.equal(defaultRetryable(status(400)).retry, false);
  assert.equal(defaultRetryable(status(401)).retry, false);
});

test("lo que pide esperar el proveedor se respeta", () => {
  assert.equal(defaultRetryable(status(429, 7_000)).afterMs, 7_000);
  assert.equal(defaultRetryable(status(429)).afterMs, undefined);
});

/*
 * Un corte de red a mitad de una generación de treinta segundos es casi siempre
 * la red: no reintentarlo tira algo que estaba a punto de salir.
 */
test("un corte de red se reintenta aunque no traiga estado", () => {
  assert.equal(defaultRetryable(new Error("fetch failed")).retry, true);
  assert.equal(defaultRetryable(new Error("socket hang up")).retry, true);
  assert.equal(defaultRetryable(new Error("no vale ese modelo")).retry, false);
});

/* --------------------------------- El tope ---------------------------------- */

test("nunca hay más de las permitidas a la vez", async () => {
  const queue = createQueue({ limit: 3 });
  let live = 0;
  let peak = 0;

  await Promise.all(
    Array.from({ length: 12 }, () =>
      queue.run("fal", async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        live -= 1;
      }),
    ),
  );

  assert.equal(peak, 3);
});

/*
 * El proveedor cuenta por cuenta, no por pantalla — pero fal y ElevenLabs son
 * cuentas distintas y compartir tope entre ellas sería frenar una por la otra.
 */
test("cada proveedor tiene su propio tope", async () => {
  const queue = createQueue({ limit: 1 });
  const order: string[] = [];

  await Promise.all([
    queue.run("fal", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("fal");
    }),
    queue.run("eleven", async () => {
      order.push("eleven");
    }),
  ]);

  // El de ElevenLabs no espera al de fal: acaba antes aunque saliera después.
  assert.deepEqual(order, ["eleven", "fal"]);
});

test("todas acaban aunque haya más que huecos", async () => {
  const queue = createQueue({ limit: 2 });

  const done = await Promise.all(
    Array.from({ length: 9 }, (_, i) => queue.run("fal", async () => i)),
  );

  assert.deepEqual(done, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

/* ------------------------------- Los reintentos ----------------------------- */

test("lo que choca con el cupo se reenvía solo", async () => {
  const time = clock();
  const queue = createQueue({ limit: 2, now: time.now, sleep: time.sleep });

  let calls = 0;

  const value = await queue.run("fal", async () => {
    calls += 1;
    if (calls < 3) throw status(429);
    return "salió";
  });

  assert.equal(value, "salió");
  assert.equal(calls, 3);
});

test("la espera se dobla en cada intento", async () => {
  const time = clock();
  const queue = createQueue({ limit: 1, baseDelayMs: 1_000, now: time.now, sleep: time.sleep });

  let calls = 0;

  await queue.run("fal", async () => {
    calls += 1;
    if (calls < 4) throw status(429);
  });

  // 1s, 2s, 4s: la cola duerme lo que le toca antes de cada reintento.
  assert.deepEqual(time.slept, [1_000, 2_000, 4_000]);
});

test("si el proveedor dice cuánto esperar, se le hace caso", async () => {
  const time = clock();
  const queue = createQueue({ limit: 1, baseDelayMs: 1_000, now: time.now, sleep: time.sleep });

  let calls = 0;

  await queue.run("fal", async () => {
    calls += 1;
    if (calls < 2) throw status(429, 9_500);
  });

  assert.deepEqual(time.slept, [9_500]);
});

test("después de agotar los intentos, el error sale", async () => {
  const time = clock();
  const queue = createQueue({ limit: 1, retries: 2, now: time.now, sleep: time.sleep });

  let calls = 0;

  await assert.rejects(
    queue.run("fal", async () => {
      calls += 1;
      throw status(429);
    }),
    /429/,
  );

  // El primero más dos reintentos.
  assert.equal(calls, 3);
});

/* Reintentar un 400 cuatro veces solo retrasa el mensaje de error. */
test("lo que no se puede reintentar sale a la primera", async () => {
  const queue = createQueue({ limit: 1 });
  let calls = 0;

  await assert.rejects(
    queue.run("fal", async () => {
      calls += 1;
      throw status(400);
    }),
  );

  assert.equal(calls, 1);
});

/* ------------------------------ La pausa común ------------------------------ */

/*
 * Lo que distingue esto de un simple tope. El 429 no dice «tú has ido rápido»,
 * dice «vamos demasiado rápido»: si solo esperara la que falló, las otras que
 * están en vuelo seguirían chocando durante minutos.
 */
test("un choque frena al proveedor entero, no solo a quien chocó", async () => {
  const time = clock();
  const queue = createQueue({
    limit: 4,
    retries: 0,
    baseDelayMs: 5_000,
    now: time.now,
    sleep: time.sleep,
  });

  await queue
    .run("fal", async () => {
      throw Object.assign(new Error("cupo"), { status: 429 });
    })
    .catch(() => {});

  // Aunque esa llamada se haya rendido: lo que dijo el proveedor sigue siendo
  // cierto para las que vengan detrás.
  assert.equal(queue.stats("fal").pausedFor, 5_000);
});

test("la pausa de un proveedor no frena a los demás", () => {
  const time = clock();
  const queue = createQueue({ now: time.now, sleep: time.sleep });

  queue.pause("fal", 10_000);

  assert.equal(queue.stats("fal").pausedFor, 10_000);
  assert.equal(queue.stats("eleven").pausedFor, 0);
});

test("una pausa más larga no la acorta otra más corta", () => {
  const time = clock();
  const queue = createQueue({ now: time.now, sleep: time.sleep });

  queue.pause("fal", 30_000);
  queue.pause("fal", 1_000);

  assert.equal(queue.stats("fal").pausedFor, 30_000);
});

test("lo que espera la pausa acaba igual, sin perderse", async () => {
  const time = clock();
  const queue = createQueue({ limit: 2, now: time.now, sleep: time.sleep });

  queue.pause("fal", 4_000);

  const done = await Promise.all([
    queue.run("fal", async () => "a"),
    queue.run("fal", async () => "b"),
  ]);

  assert.deepEqual(done, ["a", "b"]);
  assert.ok(time.slept.includes(4_000));
});

/* ---------------------------------- El estado ------------------------------- */

test("se puede mirar qué hay en marcha para enseñarlo", async () => {
  const queue = createQueue({ limit: 1 });

  const first = queue.run("fal", () => new Promise((r) => setTimeout(r, 20)));
  const second = queue.run("fal", async () => {});

  // Un tick para que la primera coja el hueco.
  await new Promise((r) => setTimeout(r, 1));

  const stats = queue.stats("fal");
  assert.equal(stats.running, 1);
  assert.equal(stats.waiting, 1);

  await Promise.all([first, second]);
  assert.equal(queue.stats("fal").running, 0);
});

test("un proveedor que no se ha usado no inventa números", () => {
  const queue = createQueue();
  assert.deepEqual(queue.stats("nadie"), { running: 0, waiting: 0, pausedFor: 0 });
});

/* Un hueco ocupado por algo que está esperando es un hueco perdido. */
test("el hueco se suelta mientras se espera entre reintentos", async () => {
  const time = clock();
  const queue = createQueue({ limit: 1, baseDelayMs: 100, now: time.now, sleep: time.sleep });

  let calls = 0;
  let peak = 0;
  let live = 0;

  await Promise.all([
    queue.run("fal", async () => {
      calls += 1;
      live += 1;
      peak = Math.max(peak, live);
      live -= 1;
      if (calls < 2) throw status(429);
    }),
    queue.run("fal", async () => {
      live += 1;
      peak = Math.max(peak, live);
      live -= 1;
    }),
  ]);

  assert.equal(peak, 1);
});
