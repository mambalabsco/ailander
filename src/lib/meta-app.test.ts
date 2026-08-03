import assert from "node:assert/strict";
import { test } from "node:test";

import { peekStore, pickAppConfig, readState, signState } from "./meta-app.ts";

/* ----------------------- Con qué app se conecta cada tienda ---------------- */

/*
 * Lo que motiva todo esto: una app de Meta solo llega a las cuentas del perfil
 * de Facebook con el que se creó. Con un segundo Business Manager en otro
 * perfil hace falta otra app, y en el entorno solo cabía una.
 */
test("la app de la tienda gana a la del entorno", () => {
  process.env.META_APP_ID = "del-entorno";
  process.env.META_APP_SECRET = "secreto-entorno";

  const chosen = pickAppConfig({ appId: "propia", appSecret: "secreto-propio" });

  assert.equal(chosen?.appId, "propia");
  assert.equal(chosen?.appSecret, "secreto-propio");
});

test("sin app propia se cae en la del entorno", () => {
  process.env.META_APP_ID = "del-entorno";
  process.env.META_APP_SECRET = "secreto-entorno";

  assert.equal(pickAppConfig(null)?.appId, "del-entorno");
  assert.equal(pickAppConfig({})?.appId, "del-entorno");
});

/*
 * Media configuración es peor que ninguna: produce un diálogo de Facebook que
 * falla al canjear el código, y el error de Meta ahí no dice qué mitad falta.
 */
test("media configuración propia no se usa a medias", () => {
  process.env.META_APP_ID = "del-entorno";
  process.env.META_APP_SECRET = "secreto-entorno";

  assert.equal(pickAppConfig({ appId: "propia" })?.appId, "del-entorno");
  assert.equal(pickAppConfig({ appSecret: "solo-secreto" })?.appId, "del-entorno");
});

test("los espacios sueltos no cuentan como configuración", () => {
  process.env.META_APP_ID = "del-entorno";
  process.env.META_APP_SECRET = "secreto-entorno";

  assert.equal(pickAppConfig({ appId: "  ", appSecret: "  " })?.appId, "del-entorno");
});

test("sin nada en ningún sitio no se inventa una app", () => {
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;

  assert.equal(pickAppConfig(null), null);
  assert.equal(pickAppConfig({ appId: "solo-id" }), null);
});

test("la configuración de Login for Business viaja si la hay", () => {
  const chosen = pickAppConfig({ appId: "a", appSecret: "b", configId: "c" });

  assert.equal(chosen?.configId, "c");
  assert.equal(pickAppConfig({ appId: "a", appSecret: "b" })?.configId, undefined);
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
