import assert from "node:assert/strict";
import { test } from "node:test";

import { slugForMarket } from "./market-slug.ts";

const cl = { countryCode: "CL", languageCode: "es" };
const mx = { countryCode: "MX", languageCode: "es" };

test("el slug lleva el mercado dentro", () => {
  assert.equal(slugForMarket("oferta-verano", cl), "oferta-verano-es-cl");
});

test("dos mercados del mismo producto nunca dan el mismo slug", () => {
  // Es la comprobación que importa: con el mismo slug, publicar en el segundo
  // mercado **pisa la página del primero** sin avisar, porque para Shopify es el
  // mismo `handle`.
  assert.notEqual(slugForMarket("oferta-verano", cl), slugForMarket("oferta-verano", mx));
});

test("publicar dos veces en el mismo mercado da el mismo slug: actualiza, no duplica", () => {
  assert.equal(slugForMarket("oferta-verano", cl), slugForMarket("oferta-verano", cl));
});

test("un slug que ya lleva el sufijo no lo repite", () => {
  // Republicar no puede ir acumulando sufijos: sería una página nueva cada vez y
  // la anterior quedaría publicada y huérfana.
  assert.equal(slugForMarket("oferta-verano-es-cl", cl), "oferta-verano-es-cl");
});

test("sin mercado el slug se queda como estaba", () => {
  // Un producto de un solo mercado publica como siempre: nada de sufijos nuevos
  // en páginas que ya están publicadas y enlazadas desde anuncios en marcha.
  assert.equal(slugForMarket("oferta-verano", null), "oferta-verano");
});

test("la barra final no se cuela dentro del sufijo", () => {
  assert.equal(slugForMarket("oferta-verano/", cl), "oferta-verano-es-cl");
});
