import assert from "node:assert/strict";
import { test } from "node:test";

import {
  declaredMediaParams,
  declaresImageReferences,
  extractImageUrls,
  extractMediaUrls,
} from "./higgsfield-urls.ts";

/* ------------------------ Qué imágenes acepta cada uno --------------------- */

test("encuentra los parámetros esté donde esté el listado", () => {
  // Las tres formas que devuelven APIs de este tipo: lista de nombres, objeto
  // indexado por nombre, y anidado.
  assert.deepEqual(declaredMediaParams({ params: ["prompt", "image_references"] }), [
    "image_references",
  ]);

  assert.deepEqual(declaredMediaParams({ params: { start_image: { type: "file" } } }), [
    "start_image",
  ]);

  assert.deepEqual(declaredMediaParams({ a: { b: { c: { params: ["end_image"] } } } }), [
    "end_image",
  ]);
});

test("un modelo puede aceptar varias, y salen todas", () => {
  const found = declaredMediaParams({ params: ["prompt", "start_image", "end_image"] });

  assert.deepEqual(found.sort(), ["end_image", "start_image"]);
});

test("un parámetro que no sabemos mandar no se declara", () => {
  // Decir que acepta algo que no sabemos traducir a bandera acabaría en
  // «Unknown params» y la generación entera abortada.
  assert.deepEqual(declaredMediaParams({ params: ["prompt", "inventado_x"] }), []);
});

test("sin parámetros en el listado no se inventa ninguno", () => {
  assert.deepEqual(declaredMediaParams({ title: "Un modelo" }), []);
  assert.deepEqual(declaredMediaParams(null), []);
});

test("un ciclo no cuelga la búsqueda", () => {
  const nodo: Record<string, unknown> = { params: ["start_image"] };
  nodo.self = nodo;

  assert.deepEqual(declaredMediaParams(nodo), ["start_image"]);
});

test("el atajo de referencias sigue diciendo lo mismo", () => {
  assert.equal(declaresImageReferences({ params: ["image_references"] }), true);
  assert.equal(declaresImageReferences({ params: ["start_image"] }), false);
});

/* ---------------------------- Las URLs del resultado ----------------------- */

test("saca las imágenes del JSON aunque esté anidado", () => {
  const salida = JSON.stringify({ result: { images: [{ url: "https://x.co/a.png" }] } });

  assert.deepEqual(extractImageUrls(salida), ["https://x.co/a.png"]);
});

/*
 * El motivo de que haya que decir qué se espera: un modelo de vídeo devuelve el
 * clip **y** su miniatura. Quedarse con la primera URL guardaría el `.jpg`.
 */
test("de un resultado de vídeo se coge el vídeo, no su miniatura", () => {
  const salida = JSON.stringify({
    result: { video_url: "https://x.co/clip.mp4", thumbnail: "https://x.co/clip.jpg" },
  });

  assert.deepEqual(extractMediaUrls(salida, "video"), ["https://x.co/clip.mp4"]);
  assert.deepEqual(extractMediaUrls(salida, "imagen"), ["https://x.co/clip.jpg"]);
});

test("también lee la URL impresa en texto plano", () => {
  // `--wait` la escribe suelta, sin JSON alrededor.
  const salida = "Job terminado\nResultado: https://x.co/clip.mp4\n";

  assert.deepEqual(extractMediaUrls(salida, "video"), ["https://x.co/clip.mp4"]);
});

test("aguanta líneas que no son JSON sin perder las que sí", () => {
  const salida = ["Generando…", JSON.stringify({ url: "https://x.co/a.mp4" }), "listo"].join("\n");

  assert.deepEqual(extractMediaUrls(salida, "video"), ["https://x.co/a.mp4"]);
});

test("no repite la misma URL aunque venga varias veces", () => {
  const salida = [
    JSON.stringify({ url: "https://x.co/a.mp4" }),
    JSON.stringify({ resultado: { url: "https://x.co/a.mp4" } }),
  ].join("\n");

  assert.equal(extractMediaUrls(salida, "video").length, 1);
});

test("la URL con parámetros de firma sigue valiendo", () => {
  // Las de almacenamiento privado llegan siempre así.
  const salida = JSON.stringify({ url: "https://x.co/a.mp4?token=abc&exp=1" });

  assert.deepEqual(extractMediaUrls(salida, "video"), ["https://x.co/a.mp4?token=abc&exp=1"]);
});

test("sin nada que parezca una URL devuelve vacío en vez de fallar", () => {
  assert.deepEqual(extractMediaUrls("Error: session expired", "video"), []);
});
