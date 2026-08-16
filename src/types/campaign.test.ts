import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAdsetName, buildCampaignName } from "./campaign.ts";

/*
 * El fallo del 16 de agosto: una campaña llamada con 514 caracteres.
 *
 * `theme` y `focus` los devuelve el modelo, y devolvió dos párrafos de prosa en
 * vez de dos etiquetas. `buildCampaignName` los concatenaba tal cual, así que el
 * nombre salió con la descripción entera de la campaña dentro. No falla nada: se
 * guarda, se ve en la lista y no se puede usar en el gestor de anuncios.
 *
 * El tope va **aquí** y no solo en el encargo porque una instrucción a un modelo
 * no es una garantía. Ya venía pasando de antes: la campaña del 28 de julio
 * tenía 354 caracteres.
 */

const PARRAFO =
  "El síntoma no es falta de voluntad: es un paso metabólico (la conversión de T4 en T3) que depende de selenio, yodo, L-tirosina y zinc. Entrada por síntoma cotidiano, reencuadre por mecanismo y cierre por oferta con garantía.";

test("un nombre de campaña no se lleva dentro un párrafo", () => {
  const name = buildCampaignName({ countryCode: "CL", theme: PARRAFO, focus: PARRAFO });

  assert.ok(
    name.length <= 120,
    `el nombre salió con ${name.length} caracteres: no cabe en el gestor de anuncios`,
  );
});

test("aun acortado, empieza por lo que identifica la campaña", () => {
  // Cortar por el final y no por el principio: las primeras palabras son las que
  // distinguen una campaña de otra en una lista.
  const name = buildCampaignName({ countryCode: "CL", theme: PARRAFO, focus: "Evitar la estatina" });

  assert.match(name, /^\[CL\]_El_Sintoma/);
});

test("lo que ya era corto no se toca", () => {
  assert.equal(
    buildCampaignName({ countryCode: "CL", theme: "Tiroides", focus: "Oferta_Precio" }),
    "[CL]_Tiroides_Oferta_Precio",
  );
});

test("el conjunto también se acota, y conserva número y etapa", () => {
  const name = buildAdsetName({ number: 13, stage: "BOFU", focus: PARRAFO });

  assert.ok(name.length <= 80, `el conjunto salió con ${name.length} caracteres`);
  // El número y la etapa son lo que nunca se puede perder: con ellos se localiza
  // el conjunto en el gestor aunque el enfoque venga recortado.
  assert.match(name, /^ADSET13_BOFU_/);
});

test("un enfoque vacío no deja un nombre acabado en guion bajo", () => {
  assert.equal(buildAdsetName({ number: 4, stage: "TOFU", focus: "" }), "ADSET4_TOFU");
});
