import assert from "node:assert/strict";
import { test } from "node:test";

import { polishPrompt, POLISH_SCHEMA } from "./prompt-polish.ts";

test("el encargo original viaja entero", () => {
  const prompt = polishPrompt({ draft: "  el frasco de Naturox sobre mármol  " });

  assert.match(prompt, /el frasco de Naturox sobre mármol/);
});

test("con imagen de partida se le dice que no describa el sujeto", () => {
  const conImagen = polishPrompt({ draft: "x", fromImage: true });
  const sinImagen = polishPrompt({ draft: "x", fromImage: false });

  assert.match(conImagen, /no describas el/);
  assert.match(sinImagen, /describir también el/);
});

test("un clip corto pide un solo movimiento", () => {
  assert.match(polishPrompt({ draft: "x", seconds: 6 }), /un solo movimiento/);
  assert.match(polishPrompt({ draft: "x", seconds: 20 }), /algo de recorrido/);
});

test("sin duración no se habla de duración", () => {
  const prompt = polishPrompt({ draft: "x" });

  assert.equal(prompt.includes("El clip dura"), false);
});

test("el contexto del producto entra solo si lo hay", () => {
  assert.match(polishPrompt({ draft: "x", context: "colágeno" }), /Contexto del producto: colágeno/);
  assert.equal(polishPrompt({ draft: "x", context: "   " }).includes("Contexto"), false);
});

test("siempre prohíbe inventar texto en pantalla", () => {
  // Es el fallo más caro: los generadores escriben letras deformes y la toma
  // se tira entera.
  assert.match(polishPrompt({ draft: "x" }), /No puedes inventar|no puedes inventar/i);
});

test("el esquema pide el prompt y la explicación", () => {
  assert.deepEqual(POLISH_SCHEMA.required, ["prompt", "cambios"]);
  assert.equal(POLISH_SCHEMA.additionalProperties, false);
});
