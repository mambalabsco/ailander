import assert from "node:assert/strict";
import { test } from "node:test";

import {
  acceptsReferences,
  buildInput,
  estimateCost,
  findGenerator,
  VIDEO_GENERATORS,
} from "./catalog.ts";

const byId = (id: string) => findGenerator(id);

test("cada generador tiene identificador y dirección propios", () => {
  const ids = new Set(VIDEO_GENERATORS.map((model) => model.id));
  const slugs = new Set(VIDEO_GENERATORS.map((model) => model.slug));

  assert.equal(ids.size, VIDEO_GENERATORS.length);
  assert.equal(slugs.size, VIDEO_GENERATORS.length);
});

test("un identificador desconocido cae en el primero, no revienta", () => {
  assert.equal(findGenerator("no-existe").id, VIDEO_GENERATORS[0].id);
});

/*
 * Esta es la prueba que justifica todo el archivo.
 *
 * El fallo que se persigue no da error: mandarle `image_urls` a uno que espera
 * `image_url` devuelve un vídeo correcto generado sin la referencia. Así que se
 * comprueba el nombre exacto del campo en cada familia.
 */
test("las referencias van con el nombre que espera cada familia", () => {
  const refs = ["https://ejemplo/a.png", "https://ejemplo/b.png"];

  const grok = buildInput(byId("grok-i2v"), { prompt: "x", references: refs });
  assert.deepEqual(grok.image_urls, refs);

  const hailuo = buildInput(byId("hailuo-i2v"), { prompt: "x", references: refs });
  // Una sola dirección, no la lista: es lo que distingue a esta familia.
  assert.equal(hailuo.image_url, refs[0]);
  assert.equal(hailuo.image_urls, undefined);

  const seedance = buildInput(byId("seedance2"), { prompt: "x", references: refs });
  assert.deepEqual(seedance.reference_image_urls, refs);
  assert.equal(seedance.image_urls, undefined);

  const pixverse = buildInput(byId("pixverse-ref"), { prompt: "x", references: refs });
  assert.deepEqual(pixverse.image_references, refs);
});

test("los de solo texto no reciben imágenes aunque se manden", () => {
  const input = buildInput(byId("grok-t2v"), {
    prompt: "x",
    references: ["https://ejemplo/a.png"],
  });

  assert.equal(input.image_urls, undefined);
  assert.equal(input.image_url, undefined);
  assert.equal(acceptsReferences(byId("grok-t2v")), false);
});

test("la duración se recorta a lo que admite cada modelo", () => {
  // Kling llega a diez; pedirle veinte lo rechazaría.
  assert.equal(buildInput(byId("kling3"), { prompt: "x", seconds: 20 }).duration, "10");

  // Grok llega a treinta.
  assert.equal(buildInput(byId("grok-i2v"), { prompt: "x", seconds: 20 }).duration, "20");

  // Y por abajo hay mínimo: menos de seis en Grok no existe.
  assert.equal(buildInput(byId("grok-i2v"), { prompt: "x", seconds: 2 }).duration, "6");
});

test("los que no aceptan duración no la reciben", () => {
  const input = buildInput(byId("pixverse-ref"), { prompt: "x", seconds: 8 });
  assert.equal(input.duration, undefined);
});

test("la proporción solo va donde está admitida", () => {
  assert.equal(
    buildInput(byId("grok-t2v"), { prompt: "x", aspectRatio: "9:16" }).aspect_ratio,
    "9:16",
  );

  assert.equal(
    buildInput(byId("kling26-i2v"), { prompt: "x", aspectRatio: "9:16" }).aspect_ratio,
    undefined,
  );
});

test("se pide 720p donde por defecto saldría a la mitad", () => {
  assert.equal(buildInput(byId("grok-i2v"), { prompt: "x" }).resolution, "720p");
  assert.equal(buildInput(byId("wan26-i2v"), { prompt: "x" }).resolution, "720p");
  assert.equal(buildInput(byId("kling3"), { prompt: "x" }).resolution, undefined);
});

test("el sonido propio va apagado salvo que se pida", () => {
  // Apagado por defecto: en el editor la locución se pega después y se solaparían.
  assert.equal(buildInput(byId("kling26-i2v"), { prompt: "x" }).sound, false);
  assert.equal(buildInput(byId("kling26-i2v"), { prompt: "x", sound: true }).sound, true);

  // Y a los que no saben generarlo no se les manda el campo.
  assert.equal(buildInput(byId("grok-i2v"), { prompt: "x", sound: true }).sound, undefined);
});

test("Kling 3.0 lleva los campos sin los que responde 422", () => {
  const input = buildInput(byId("kling3"), { prompt: "x", seconds: 5 });
  assert.equal(input.multi_shots, false);
  assert.equal(input.mode, "std");
});

test("el precio sale solo cuando está confirmado", () => {
  assert.equal(estimateCost(byId("grok-i2v"), 10), 0.15);
  assert.equal(estimateCost(byId("kling3"), 10), 0.7);

  // Sin precio confirmado no se inventa uno: se dice que no se sabe.
  assert.equal(estimateCost(byId("wan26-i2v"), 10), null);
});

test("el prompt siempre viaja", () => {
  for (const model of VIDEO_GENERATORS) {
    assert.equal(buildInput(model, { prompt: "hola" }).prompt, "hola");
  }
});
