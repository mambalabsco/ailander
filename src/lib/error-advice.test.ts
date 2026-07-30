import { test } from "node:test";
import assert from "node:assert/strict";

import { adviseOn } from "./error-advice.ts";

test("el error real de hoy se reconoce y nombra la tabla", () => {
  /*
   * Es el que costó una sesión de SSH y `journalctl`. PostgREST dice «schema
   * cache», que suena a problema de caché y no lo es: la tabla no existe.
   */
  const advice = adviseOn(
    "No se pudieron leer los pedidos: Could not find the table 'public.shop_orders' in the schema cache",
  );

  assert.ok(advice);
  assert.match(advice.title, /migraciones/i);
  assert.ok(advice.explanation.includes("shop_orders"), "debe decir qué tabla falta");
  assert.ok(advice.command?.includes("db:push"), "debe dar el comando que lo arregla");
});

test("también el de ad_accounts", () => {
  const advice = adviseOn(
    "No se pudieron leer las cuentas: Could not find the table 'public.ad_accounts' in the schema cache",
  );

  assert.ok(advice?.explanation.includes("ad_accounts"));
});

test("una columna que falta es el mismo caso", () => {
  const advice = adviseOn('Could not find the \'shop_currency\' column of \'stores\'');

  assert.ok(advice);
  assert.ok(advice.command?.includes("db:push"));
});

test("la sesión caducada manda a entrar, no a la base de datos", () => {
  const advice = adviseOn("Auth session missing!");

  assert.ok(advice);
  assert.match(advice.title, /sesión/i);
  assert.equal(advice.command, undefined, "aquí no hay ningún comando que ejecutar");
});

test("el saldo agotado dice que no se cobró nada", () => {
  const advice = adviseOn("Your credit balance is too low to access the Anthropic API");

  assert.ok(advice);
  assert.match(advice.explanation, /no se cobró nada/);
});

test("el permiso de Meta avisa de que el beneficio sale inflado", () => {
  const advice = adviseOn("Meta rechazó el permiso: caducó o se revocó.");

  assert.ok(advice);
  assert.match(advice.explanation, /más alto del real/);
  assert.match(advice.where ?? "", /Conexiones/);
});

test("un error desconocido no recibe un consejo inventado", () => {
  /*
   * Es la regla que protege la utilidad del resto. Un diagnóstico equivocado
   * manda a mirar donde no es y cuesta más tiempo que no dar ninguno; quien
   * llama enseña entonces el mensaje crudo.
   */
  assert.equal(adviseOn("TypeError: undefined is not a function"), null);
  assert.equal(adviseOn("Algo raro pasó en el servidor"), null);
  assert.equal(adviseOn(""), null);
});
