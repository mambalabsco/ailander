import assert from "node:assert/strict";
import { test } from "node:test";

import {
  acceptsReferences,
  buildInput,
  durationLabel,
  estimateCost,
  findGenerator,
  hasNativeAudio,
  nearestDuration,
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

test("las duraciones fijas están dentro de su propio rango y ordenadas", () => {
  for (const model of VIDEO_GENERATORS) {
    if (model.durations.length === 0) continue;

    assert.deepEqual(model.durations, [...model.durations].sort((a, b) => a - b), model.id);
    assert.equal(model.durations[0], model.minSeconds, model.id);
    assert.equal(model.durations[model.durations.length - 1], model.maxSeconds, model.id);
  }
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

  assert.deepEqual(buildInput(byId("grok-i2v"), { prompt: "x", references: refs }).image_urls, refs);

  const hailuo = buildInput(byId("hailuo-i2v"), { prompt: "x", references: refs });
  // Una sola dirección, no la lista: es lo que distingue a esta familia.
  assert.equal(hailuo.image_url, refs[0]);
  assert.equal(hailuo.image_urls, undefined);

  const seedance = buildInput(byId("seedance2"), { prompt: "x", references: refs });
  assert.deepEqual(seedance.reference_image_urls, refs);
  assert.equal(seedance.image_urls, undefined);

  assert.deepEqual(
    buildInput(byId("pixverse-ref"), { prompt: "x", references: refs }).image_references,
    refs,
  );
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

/* ------------------------------ Las duraciones ----------------------------- */

/*
 * Varios no venden cualquier duración: Wan solo 5, 10 o 15, y Hailuo 6 o 10.
 * Mandarles otra la rechazan — no la redondean ellos.
 */
test("con lista cerrada se sube al siguiente que exista", () => {
  // Siete segundos en Wan son diez, no siete ni cinco: cortar la frase es peor
  // que pagar unos segundos de más.
  assert.equal(nearestDuration(byId("wan26-i2v"), 7), 10);
  assert.equal(nearestDuration(byId("wan26-i2v"), 5), 5);
  assert.equal(nearestDuration(byId("wan26-i2v"), 11), 15);

  assert.equal(nearestDuration(byId("hailuo-i2v"), 7), 10);
  assert.equal(nearestDuration(byId("hailuo-i2v"), 6), 6);
});

test("pasarse del máximo se queda en el máximo", () => {
  assert.equal(nearestDuration(byId("wan26-i2v"), 40), 15);
  assert.equal(nearestDuration(byId("hailuo-i2v"), 40), 10);
  assert.equal(nearestDuration(byId("grok-i2v"), 40), 30);
});

test("quedarse corto sube al mínimo", () => {
  assert.equal(nearestDuration(byId("grok-i2v"), 2), 6);
  assert.equal(nearestDuration(byId("kling3"), 1), 3);
});

test("los de duración libre respetan lo que se pide", () => {
  assert.equal(nearestDuration(byId("kling3"), 7), 7);
  assert.equal(nearestDuration(byId("seedance2"), 12), 12);
});

test("la duración va como número solo donde se espera número", () => {
  // Seedance y PixVerse la quieren entera; el resto, como texto.
  assert.strictEqual(buildInput(byId("seedance2"), { prompt: "x", seconds: 8 }).duration, 8);
  assert.strictEqual(buildInput(byId("pixverse-ref"), { prompt: "x", seconds: 8 }).duration, 8);
  assert.strictEqual(buildInput(byId("grok-i2v"), { prompt: "x", seconds: 8 }).duration, "8");
  assert.strictEqual(buildInput(byId("wan26-i2v"), { prompt: "x", seconds: 8 }).duration, "10");
});

test("sin duración pedida no se manda ninguna", () => {
  assert.equal(buildInput(byId("grok-i2v"), { prompt: "x" }).duration, undefined);
});

test("la etiqueta dice la verdad de cada modelo", () => {
  assert.equal(durationLabel(byId("wan26-i2v")), "Solo 5, 10 o 15 s");
  assert.equal(durationLabel(byId("hailuo-i2v")), "Solo 6 o 10 s");
  assert.equal(durationLabel(byId("grok-i2v")), "De 6 a 30 s");
});

/* --------------------------- Los demás parámetros -------------------------- */

test("la proporción solo va donde está admitida", () => {
  assert.equal(
    buildInput(byId("grok-t2v"), { prompt: "x", aspectRatio: "9:16" }).aspect_ratio,
    "9:16",
  );

  assert.equal(
    buildInput(byId("hailuo-i2v"), { prompt: "x", aspectRatio: "9:16" }).aspect_ratio,
    undefined,
  );
});

test("la resolución se escribe como la escribe cada familia", () => {
  assert.equal(buildInput(byId("grok-i2v"), { prompt: "x" }).resolution, "720p");
  assert.equal(buildInput(byId("wan26-i2v"), { prompt: "x" }).resolution, "720p");

  // Hailuo no entiende «720p»: los suyos son 512P y 768P, con P mayúscula.
  assert.equal(buildInput(byId("hailuo-i2v"), { prompt: "x" }).resolution, "768P");

  assert.equal(buildInput(byId("kling3"), { prompt: "x" }).resolution, undefined);
});

test("el interruptor de sonido se llama distinto en cada familia", () => {
  assert.equal(buildInput(byId("kling26-i2v"), { prompt: "x", sound: true }).sound, true);
  assert.equal(
    buildInput(byId("seedance2"), { prompt: "x", sound: true }).generate_audio,
    true,
  );
  assert.equal(
    buildInput(byId("pixverse-ref"), { prompt: "x", sound: true }).generate_audio_switch,
    true,
  );
});

test("el sonido propio va apagado salvo que se pida", () => {
  // Apagado por defecto: en el editor la locución se pega después y se solaparían.
  assert.equal(buildInput(byId("kling26-i2v"), { prompt: "x" }).sound, false);

  // Y a los que no saben generarlo no se les manda ningún campo.
  const grok = buildInput(byId("grok-i2v"), { prompt: "x", sound: true });
  assert.equal(grok.sound, undefined);
  assert.equal(grok.generate_audio, undefined);
  assert.equal(hasNativeAudio(byId("grok-i2v")), false);
});

test("Kling 3.0 lleva los campos sin los que responde 422", () => {
  const input = buildInput(byId("kling3"), { prompt: "x", seconds: 5 });

  assert.equal(input.multi_shots, false);
  assert.equal(input.mode, "std");
});

test("el precio se calcula sobre la duración que se va a cobrar", () => {
  assert.equal(estimateCost(byId("grok-i2v"), 10), 0.15);

  // Kling acepta 3-15 libres, así que siete segundos son siete.
  assert.equal(estimateCost(byId("kling3"), 7), 0.49);

  // Sin precio confirmado no se inventa uno: se dice que no se sabe.
  assert.equal(estimateCost(byId("wan26-i2v"), 10), null);
});

test("el prompt siempre viaja", () => {
  for (const model of VIDEO_GENERATORS) {
    assert.equal(buildInput(model, { prompt: "hola" }).prompt, "hola");
  }
});
