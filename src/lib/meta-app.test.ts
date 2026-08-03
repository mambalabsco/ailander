import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseApp, envAppConfig, peekStore, readState, signState } from "./meta-app.ts";

/* ----------------------- Con qué app se conecta cada tienda ---------------- */

const propia = { appId: "propia", appSecret: "secreto-propio" };
const defecto = { appId: "por-defecto", appSecret: "secreto-defecto" };
const entorno = { appId: "del-entorno", appSecret: "secreto-entorno" };

/*
 * Lo normal es tener **una** app que sirve para todo: lo que decide qué cuentas
 * se ven es el perfil de Facebook que inicia sesión, no la app. La elección por
 * tienda existe para el caso raro de un perfil sin rol en la de por defecto.
 */
test("la de la tienda gana a todas", () => {
  assert.equal(chooseApp([propia, defecto, entorno])?.appId, "propia");
});

test("sin elección propia manda la de por defecto", () => {
  assert.equal(chooseApp([null, defecto, entorno])?.appId, "por-defecto");
});

test("sin ninguna dada de alta queda la del entorno", () => {
  assert.equal(chooseApp([null, null, entorno])?.appId, "del-entorno");
});

test("sin nada en ningún sitio no se inventa una app", () => {
  assert.equal(chooseApp([null, null, null]), null);
  assert.equal(chooseApp([]), null);
});

/*
 * Media configuración es peor que ninguna: da un diálogo de Facebook que falla
 * al canjear el código, con un error que no dice qué mitad falta.
 */
test("una app a medias se salta, no se completa con la siguiente", () => {
  assert.equal(chooseApp([{ appId: "propia" }, defecto])?.appId, "por-defecto");
  assert.equal(chooseApp([{ appSecret: "suelto" }, defecto])?.appId, "por-defecto");

  // Y no se mezcla: el secreto es el de la que ganó, no el de la incompleta.
  assert.equal(chooseApp([{ appId: "propia" }, defecto])?.appSecret, "secreto-defecto");
});

test("los espacios sueltos no cuentan como configuración", () => {
  assert.equal(chooseApp([{ appId: "  ", appSecret: "  " }, defecto])?.appId, "por-defecto");
});

test("la configuración de Login for Business viaja con su app", () => {
  assert.equal(chooseApp([{ ...propia, configId: "c" }])?.configId, "c");
  assert.equal(chooseApp([propia])?.configId, undefined);
});

test("el envoltorio del entorno respeta las dos variables", () => {
  process.env.META_APP_ID = "del-entorno";
  process.env.META_APP_SECRET = "secreto-entorno";
  assert.equal(envAppConfig()?.appId, "del-entorno");

  delete process.env.META_APP_SECRET;
  assert.equal(envAppConfig(), null);
});

/* ------------------------------- El `state` -------------------------------- */

test("el estado firmado se lee con su secreto", () => {
  const state = signState("tienda-1", "secreto");

  assert.deepEqual(readState(state, "secreto"), { storeId: "tienda-1" });
});

/*
 * Esta es la que protege el cambio: cada tienda puede tener su app, así que
 * para saber con qué secreto verificar hay que leer antes qué tienda es — y eso
 * viene dentro del propio estado, sin firmar.
 */
test("la tienda se puede leer antes de verificar la firma", () => {
  const state = signState("tienda-1", "secreto");

  assert.equal(peekStore(state), "tienda-1");
});

test("leerla sin verificar no vale de nada por sí solo", () => {
  // Un estado inventado da su tienda, pero la firma no cuadra con el secreto de
  // esa tienda y se rechaza igual.
  const forged = "tienda-de-otro.abc.firmafalsa";

  assert.equal(peekStore(forged), "tienda-de-otro");
  assert.equal(readState(forged, "secreto"), null);
});

test("un estado con el secreto equivocado se rechaza", () => {
  const state = signState("tienda-1", "secreto-a");

  assert.equal(readState(state, "secreto-b"), null);
});

test("un estado deforme no revienta", () => {
  assert.equal(peekStore(""), "");
  assert.equal(readState("", "secreto"), null);
  assert.equal(readState("solo.dos", "secreto"), null);
});

test("dos firmas del mismo dato no se repiten", () => {
  // Llevan un nonce: dos idénticas permitirían reutilizar una vuelta anterior.
  assert.notEqual(signState("tienda-1", "s"), signState("tienda-1", "s"));
});
