import assert from "node:assert/strict";
import { test } from "node:test";
import { expires, storageRefFrom } from "./storage-url.ts";

const BASE = "https://abcdefg.supabase.co";

test("reconoce una dirección firmada", () => {
  const url = `${BASE}/storage/v1/object/sign/product-images/tienda/1/frente.png?token=eyJhbGc`;

  assert.deepEqual(storageRefFrom(url, BASE), {
    bucket: "product-images",
    path: "tienda/1/frente.png",
  });
});

test("reconoce la pública y la autenticada", () => {
  assert.deepEqual(storageRefFrom(`${BASE}/storage/v1/object/public/libreria/a/b.png`, BASE), {
    bucket: "libreria",
    path: "a/b.png",
  });

  assert.deepEqual(storageRefFrom(`${BASE}/storage/v1/object/authenticated/x/y.png`, BASE), {
    bucket: "x",
    path: "y.png",
  });
});

test("una ruta con espacios vuelve legible", () => {
  const url = `${BASE}/storage/v1/object/sign/imgs/tienda/foto%20principal.png?token=x`;

  assert.equal(storageRefFrom(url, BASE)?.path, "tienda/foto principal.png");
});

test("lo que no es nuestro no es nuestro", () => {
  assert.equal(storageRefFrom("https://cdn.shopify.com/s/files/1/a.png", BASE), null);
  assert.equal(storageRefFrom("https://v3.fal.media/files/x.mp4", BASE), null);
});

test("un servidor que solo empieza igual no cuela", () => {
  /*
   * `startsWith` daría por nuestra esta dirección, que es de quien la ponga.
   * No filtraría nada al volver a firmarla, pero delataría si el objeto existe.
   */
  const impostor = "https://abcdefg.supabase.co.malo.com/storage/v1/object/sign/b/p.png?token=x";

  assert.equal(storageRefFrom(impostor, BASE), null);
});

test("sin cubo o sin ruta no hay referencia", () => {
  assert.equal(storageRefFrom(`${BASE}/storage/v1/object/sign/solo-cubo`, BASE), null);
  assert.equal(storageRefFrom(`${BASE}/otra/cosa`, BASE), null);
  assert.equal(storageRefFrom("", BASE), null);
  assert.equal(storageRefFrom(`${BASE}/storage/v1/object/sign/b/p.png`, ""), null);
});

test("una dirección rota no revienta", () => {
  assert.equal(storageRefFrom("no es una url", BASE), null);
});

test("solo caducan las firmadas", () => {
  assert.ok(expires(`${BASE}/storage/v1/object/sign/b/p.png?token=x`));
  assert.ok(!expires(`${BASE}/storage/v1/object/public/b/p.png`));
  assert.ok(!expires("https://cdn.shopify.com/s/files/1/a.png"));
});
