import assert from "node:assert/strict";
import { test } from "node:test";

import { LOOP_SECONDS, MOTION_TYPES, buildMotionPrompt, isMotionFile } from "./landing-motion.ts";

test("el encargo de vídeo pide lo que un encargo de foto no dice", () => {
  /*
   * Un encargo de foto describe un instante; uno de vídeo, qué cambia. Pidiendo
   * «movimiento» sobre una descripción de foto, el generador mueve la cámara
   * sobre una escena quieta — un travelling sobre un bodegón, que es justo lo
   * que delata que era una foto.
   */
  const prompt = buildMotionPrompt({
    scene: "Un frasco ámbar sobre una mesa de madera, luz de ventana",
    productName: "TiniCalm",
    aspectRatio: "4:5",
  });

  assert.ok(prompt.includes("Un frasco ámbar"), "la escena se conserva");
  assert.ok(prompt.includes("Acaba donde empieza"), "va en bucle");
  assert.ok(prompt.includes("cámara **quieta**"));
  assert.ok(prompt.includes("Un solo movimiento"));
  assert.ok(prompt.includes(`${LOOP_SECONDS[0]} y ${LOOP_SECONDS[1]} segundos`));
  assert.ok(prompt.includes("4:5"));
});

test("un webp animado no se rechaza por su tipo", () => {
  /*
   * Los navegadores mandan un webp animado con el mismo tipo que uno quieto, así
   * que por el tipo solo no se distingue. Rechazarlo obligaría a convertirlo a
   * GIF para nada — y un GIF pesa varias veces más.
   */
  assert.ok(isMotionFile({ type: "image/webp", name: "bucle.webp" }));
  assert.ok(isMotionFile({ type: "", name: "bucle.webm" }), "sin tipo, por la extensión");
  assert.ok(isMotionFile({ type: "video/mp4", name: "" }), "sin nombre, por el tipo");

  assert.ok(!isMotionFile({ type: "image/png", name: "foto.png" }));
  assert.ok(!isMotionFile({ type: "", name: "" }));
});

test("el webm va primero de la lista", () => {
  // Pesa una fracción de un GIF con la misma calidad, y en una landing el peso
  // es tiempo de carga sobre alguien que está decidiendo si se queda.
  assert.equal(MOTION_TYPES[0], "video/webm");
});
