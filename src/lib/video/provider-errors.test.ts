import assert from "node:assert/strict";
import { test } from "node:test";
import { explainProvider } from "./provider-errors.ts";

test("el caso real: cuenta sin saldo", () => {
  /*
   * Esto es literalmente lo que devolvió fal al montar un vídeo. Tal cual
   * parece un fallo de la plataforma: lo primero que se hace al leerlo es
   * volver a intentarlo —falla igual— y después mirar el código, que está bien.
   */
  const problem = explainProvider("el montaje", 403, '{"detail":"User is locked. Reason: TOP_UP."}');

  assert.match(problem.message, /sin saldo/);
  assert.match(problem.message, /fal\.ai\/dashboard\/billing/);
  assert.equal(problem.worthRetrying, false);
});

test("sin saldo se distingue de clave mal puesta, aunque las dos sean 403", () => {
  // Una se arregla pagando y la otra tocando el entorno del servidor.
  const clave = explainProvider("el montaje", 403, "Forbidden");

  assert.match(clave.message, /FAL_KEY/);
  assert.ok(!/saldo/.test(clave.message));
});

test("el contenido rechazado dice que no se repita", () => {
  const problem = explainProvider("la música", 422, "content policy violation");

  assert.match(problem.message, /dará lo mismo/);
  assert.equal(problem.worthRetrying, false);
});

test("el cupo y los fallos del proveedor sí se reintentan", () => {
  // Son los dos casos en los que el mismo encargo puede salir bien un minuto
  // después, y es lo que la cola ya hace sola.
  assert.equal(explainProvider("el montaje", 429, "rate limited").worthRetrying, true);
  assert.equal(explainProvider("el montaje", 503, "unavailable").worthRetrying, true);
});

test("lo que se estaba haciendo va dentro del mensaje", () => {
  /*
   * Un error sin la tarea delante obliga a adivinar cuál de las cinco cosas que
   * estaban en marcha se cayó.
   */
  for (const status of [403, 401, 422, 429, 500, 418]) {
    assert.match(explainProvider("el encadenado", status, "x").message, /el encadenado/, String(status));
  }
});

test("un error desconocido se pasa tal cual, sin inventarse la causa", () => {
  const problem = explainProvider("el montaje", 418, "soy una tetera");

  assert.match(problem.message, /418/);
  assert.match(problem.message, /tetera/);
  assert.equal(problem.worthRetrying, false);
});

test("el detalle se recorta para que quepa en pantalla", () => {
  const problem = explainProvider("el montaje", 418, "x".repeat(2000));

  assert.ok(problem.message.length < 400);
});
