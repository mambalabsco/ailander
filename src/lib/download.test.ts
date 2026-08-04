import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedHost, fileNameFor } from "./download.ts";

/* ------------------------------ La lista blanca ---------------------------- */

test("los dominios de los proveedores pasan", () => {
  assert.equal(allowedHost("v3.fal.media"), true);
  assert.equal(allowedHost("file.aiquickdraw.com"), true);
  assert.equal(allowedHost("abcdef.supabase.co"), true);
});

/*
 * Sin el punto delante, «acaba en fal.media» lo cumple cualquier dominio que
 * termine con esas letras — y ese es todo el agujero.
 */
test("un dominio que solo acaba parecido no cuela", () => {
  assert.equal(allowedHost("malicioso-fal.media"), false);
  assert.equal(allowedHost("falmedia.com"), false);
  assert.equal(allowedHost("fal.media.atacante.com"), false);
});

/*
 * El servidor llega a sitios a los que nadie llega desde fuera. Sin lista, una
 * descarga se convierte en una ventana a la red interna.
 */
test("lo interno se queda fuera", () => {
  assert.equal(allowedHost("localhost"), false);
  assert.equal(allowedHost("127.0.0.1"), false);
  assert.equal(allowedHost("169.254.169.254"), false);
  assert.equal(allowedHost("10.0.0.5"), false);
});

test("el punto final de un dominio absoluto no lo salva", () => {
  // `fal.media.` y `fal.media` son el mismo host para el resolvedor.
  assert.equal(allowedHost("v3.fal.media."), true);
  assert.equal(allowedHost("interno.local."), false);
});

test("las mayúsculas no cambian nada", () => {
  assert.equal(allowedHost("V3.FAL.MEDIA"), true);
});

/* -------------------------------- El nombre -------------------------------- */

test("un nombre legible se conserva, con la extensión del tipo", () => {
  assert.equal(fileNameFor("/files/anuncio-naturox.mp4", "video/mp4"), "anuncio-naturox.mp4");
});

test("un identificador no sirve de nombre", () => {
  // Guardar `a3f9b2c14d5e11ef.mp4` es no encontrarlo nunca.
  assert.equal(fileNameFor("/files/a3f9b2c14d5e11ef9abc.mp4", "video/mp4"), "plataforma-mp4.mp4");
});

test("la extensión sale del tipo, no de la dirección", () => {
  // Muchos proveedores sirven sin extensión, o con una que miente.
  assert.equal(fileNameFor("/files/retrato", "image/png"), "retrato.png");
  assert.equal(fileNameFor("/files/retrato.bin", "image/png"), "retrato.png");
});

/*
 * El nombre va dentro de una cabecera entre comillas: una comilla o un salto de
 * línea dentro la partirían, y eso es una cabecera inyectada.
 */
test("lo que rompería la cabecera se limpia", () => {
  const name = fileNameFor('/files/mal"nombre\nsegunda.mp4', "video/mp4");

  assert.equal(name.includes('"'), false);
  assert.equal(name.includes("\n"), false);
});

test("un tipo desconocido no inventa extensión", () => {
  assert.equal(fileNameFor("/files/cosa-rara", "application/octet-stream"), "cosa-rara");
});

test("una dirección sin nombre devuelve algo, no vacío", () => {
  assert.ok(fileNameFor("/", "video/mp4").length > 0);
});

test("un nombre larguísimo se recorta", () => {
  const name = fileNameFor(`/files/${"a".repeat(200)}.mp4`, "video/mp4");

  assert.ok(name.length <= 64);
});
