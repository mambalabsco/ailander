import assert from "node:assert/strict";
import { test } from "node:test";

import { describeVideoAnalyses, normalizeAnatomia } from "./anatomia.ts";

const analysis = {
  hook: "Empieza con la factura de la luz",
  promise: "Bajarla a la mitad",
  voice: "Un vecino, no un vendedor",
  beats: [],
  averageShotSeconds: 2.4,
  productMoment: "A los 12 segundos, en la mano",
  callToAction: "Enlace en el primer comentario",
  whyItWorks: "El problema se ve antes de que nadie hable",
};

test("los vídeos entran descritos, no como datos sueltos", () => {
  const text = describeVideoAnalyses([analysis]);

  assert.match(text, /Empieza con la factura/);
  assert.match(text, /2,4|2\.4/);
});

test("sin vídeos no se escribe una sección vacía", () => {
  // Un encabezado sin nada debajo le dice al modelo que había vídeos y no los
  // vio, y entonces se pone a suponer qué salía en ellos.
  assert.equal(describeVideoAnalyses([]), "");
});

test("varios vídeos van numerados, para poder citarlos", () => {
  const text = describeVideoAnalyses([analysis, { ...analysis, hook: "Otro gancho" }]);

  assert.match(text, /Vídeo 1/);
  assert.match(text, /Vídeo 2/);
});

test("una anatomía vieja, sin ownership, se lee como ajena", () => {
  // Las que ya están guardadas se escribieron antes de que este campo existiera.
  // 'ajeno' es el lado seguro: como mucho prohíbe heredar algo que sí se podía.
  // Al revés, un `propio` supuesto deja pasar la cifra de otra marca.
  const leida = normalizeAnatomia({ promesa: "Bajarla a la mitad", entrada: "La factura" });

  assert.equal(leida.ownership, "ajeno");
  assert.equal(leida.promesa, "Bajarla a la mitad");
});

test("un ownership que no es ninguno de los dos también cae en ajeno", () => {
  assert.equal(normalizeAnatomia({ ownership: "cualquier cosa" }).ownership, "ajeno");
});

test("el ownership guardado se respeta", () => {
  assert.equal(normalizeAnatomia({ ownership: "propio" }).ownership, "propio");
});

test("las listas ausentes salen vacías y no como undefined", () => {
  // `estructura.map(...)` sobre undefined revienta el encargo entero, y el
  // payload es JSON: puede venir sin ellas.
  const leida = normalizeAnatomia({});

  assert.deepEqual(leida.estructura, []);
  assert.deepEqual(leida.objeciones, []);
});
