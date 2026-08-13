import assert from "node:assert/strict";
import { test } from "node:test";

import { describeVideoAnalyses } from "./anatomia.ts";

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
