import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COPY_FORMATS,
  buildFlowCopyPrompt,
  findCopyFormat,
  renderCopy,
  spokenPart,
} from "./copy.ts";

const CONTEXTO = "## Contexto del producto\n\nProducto: Naturox";

test("un formato que no existe cae en el primero, no revienta", () => {
  assert.equal(findCopyFormat("inventado").id, "anuncio");
  assert.equal(findCopyFormat("voz").id, "voz");
});

test("cada formato se explica", () => {
  for (const format of COPY_FORMATS) {
    assert.ok(format.label && format.note, format.id);
  }
});

/* -------------------------------- Aplanado ---------------------------------- */

test("el anuncio junta las tres partes", () => {
  const texto = renderCopy(
    { texto: "Cuerpo", titular: "Titular", descripcion: "Desc" },
    "anuncio",
  );

  assert.equal(texto, "Cuerpo\n\nTitular\n\nDesc");
});

test("lo que falta no deja huecos", () => {
  assert.equal(renderCopy({ texto: "Cuerpo", titular: "" }, "anuncio"), "Cuerpo");
});

/*
 * Leer en voz alta el titular y la descripción es el fallo silencioso de
 * siempre: no da error, sale un anuncio en el que la voz lee campos sueltos.
 */
test("la locución solo lleva el cuerpo", () => {
  const copy = { texto: "Me dolían las rodillas.", titular: "Titular", descripcion: "Desc" };

  assert.equal(renderCopy(copy, "voz"), "Me dolían las rodillas.");
  assert.equal(spokenPart(copy), "Me dolían las rodillas.");
});

test("el gancho tampoco arrastra el resto", () => {
  assert.equal(renderCopy({ texto: "Una frase", titular: "T" }, "gancho"), "Una frase");
});

/* -------------------------------- El encargo -------------------------------- */

test("el contexto del producto va dentro", () => {
  const prompt = buildFlowCopyPrompt({ context: CONTEXTO, format: "anuncio" });
  assert.ok(prompt.includes("Producto: Naturox"));
});

test("cada formato pide lo suyo", () => {
  assert.match(buildFlowCopyPrompt({ context: CONTEXTO, format: "anuncio" }), /Titular/);
  assert.match(buildFlowCopyPrompt({ context: CONTEXTO, format: "voz" }), /voz alta/);
  assert.match(buildFlowCopyPrompt({ context: CONTEXTO, format: "gancho" }), /una sola frase/i);
});

/*
 * «Que dure veinte segundos» no le dice nada a un modelo que no cronometra. Se
 * traduce a palabras, que es lo que sí sabe contar.
 */
test("los segundos se traducen a palabras", () => {
  const prompt = buildFlowCopyPrompt({ context: CONTEXTO, format: "voz", seconds: 20 });
  assert.match(prompt, /50 palabras/);
});

test("sin segundos no se inventa una longitud", () => {
  const prompt = buildFlowCopyPrompt({ context: CONTEXTO, format: "voz" });
  assert.ok(!/palabras\./.test(prompt));
});

test("el ángulo entra cuando lo hay", () => {
  const prompt = buildFlowCopyPrompt({
    context: CONTEXTO,
    format: "anuncio",
    angle: "Para quien ya probó colágeno y no notó nada",
  });

  assert.match(prompt, /ya probó colágeno/);
});

test("sin ángulo no queda la sección vacía", () => {
  const prompt = buildFlowCopyPrompt({ context: CONTEXTO, format: "anuncio" });
  assert.ok(!prompt.includes("El ángulo por el que va"));
});

/* Las promesas médicas son las que tumban una cuenta publicitaria. */
test("siempre se prohíben las promesas médicas", () => {
  for (const format of COPY_FORMATS) {
    const prompt = buildFlowCopyPrompt({ context: CONTEXTO, format: format.id });
    assert.match(prompt, /promesas médicas/, format.id);
  }
});
