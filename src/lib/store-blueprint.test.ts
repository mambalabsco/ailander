import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXTRACTED,
  NOT_EXTRACTED,
  classifyScripts,
  imagesNeeded,
  tierDiscounts,
  type BlueprintSection,
} from "./store-blueprint.ts";

/* -------------------------------- Scripts ---------------------------------- */

test("un pixel nunca es importable", () => {
  /*
   * Es la regla dura. Un pixel lleva dentro el identificador de la cuenta de
   * otro: copiarlo mandaría los eventos de tus clientes a su panel de anuncios
   * y de paso le diría qué vendes y cuánto.
   */
  const scripts = classifyScripts([
    "https://connect.facebook.net/en_US/fbevents.js",
    "https://www.googletagmanager.com/gtm.js?id=GTM-XXXX",
    "https://analytics.tiktok.com/i18n/pixel/events.js",
  ]);

  assert.equal(scripts.length, 3);
  for (const script of scripts) {
    assert.equal(script.kind, "pixel");
    assert.equal(script.importable, false, `${script.name} no debería ser importable`);
  }
});

test("una librería de animación sí se puede usar", () => {
  // Es una biblioteca pública con su licencia; no lleva la cuenta de nadie.
  const [script] = classifyScripts(["https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"]);

  assert.equal(script.kind, "animacion");
  assert.equal(script.importable, true);
});

test("las apps de Shopify se identifican y mandan a instalarlas, no a copiarlas", () => {
  const scripts = classifyScripts([
    "https://cdn.judge.me/widget.js",
    "https://widget.tidio.co/abc.js",
  ]);

  assert.deepEqual(
    scripts.map((script) => script.kind).sort(),
    ["chat", "reseñas"],
  );
  assert.ok(scripts.every((script) => /instálala|instalala/i.test(script.note)));
});

test("lo desconocido sale con su dominio en vez de descartarse", () => {
  const [script] = classifyScripts(["https://raro.example.com/algo.js"]);

  assert.equal(script.kind, "otro");
  assert.equal(script.name, "raro.example.com");
  assert.match(script.note, /Míralo antes/);
});

test("el mismo servicio cargado tres veces sale una", () => {
  // Una tienda carga el mismo pixel desde varios sitios; contarlo tres veces
  // daría una lista ilegible.
  const scripts = classifyScripts([
    "https://connect.facebook.net/en_US/fbevents.js",
    "https://connect.facebook.net/signals/config/123",
    "https://www.facebook.com/tr?id=123",
  ]);

  assert.equal(scripts.length, 1);
});

test("una URL rota, o relativa, no entra en la lista", () => {
  /*
   * Un `src` relativo es código del propio tema, no un servicio de terceros: no
   * hay nada que clasificar ni que decidir sobre importarlo. Resolverlo contra
   * una base lo haría aparecer como si viniera de ella.
   */
  assert.deepEqual(classifyScripts(["", "no-es-una-url", "://roto", "/assets/theme.js"]), []);
});

test("un script sin protocolo sí se reconoce", () => {
  // `//cdn.example.com/x.js` es válido en HTML y se ve en tiendas reales.
  const [script] = classifyScripts(["//connect.facebook.net/en_US/fbevents.js"]);

  assert.equal(script.kind, "pixel");
  assert.equal(script.importable, false);
});

/* ---------------------------------- Oferta --------------------------------- */

test("el descuento real de cada tramo, que casi nunca es el anunciado", () => {
  /*
   * Una página anuncia «40% en el pack de tres» y el cálculo sale al 31%.
   * Compararlo contra el precio del tramo de uno lo deja a la vista.
   */
  const rows = tierDiscounts([
    { quantity: 1, price: 49, compareAt: null, highlighted: false },
    { quantity: 3, price: 102, compareAt: 147, highlighted: true },
  ]);

  assert.equal(rows[1].perUnit, 34);
  assert.equal(rows[1].discount, 30.6);
});

test("sin tramo de uno no se inventa un descuento", () => {
  // Un 0% ahí sería mentira: no hay contra qué comparar.
  const rows = tierDiscounts([{ quantity: 3, price: 102, compareAt: null, highlighted: true }]);

  assert.equal(rows[0].discount, null);
});

/* -------------------------------- Imágenes --------------------------------- */

test("cuenta cuántas imágenes hay que generar", () => {
  const sections: BlueprintSection[] = [
    { kind: "heroe", purpose: "", angle: "", images: 1 },
    { kind: "beneficios", purpose: "", angle: "", images: 3 },
    { kind: "faq", purpose: "", angle: "", images: 0 },
  ];

  assert.equal(imagesNeeded(sections), 4);
});

/* ------------------------- Lo que entra y lo que no ------------------------ */

test("está escrito qué no se extrae, y por qué", () => {
  const texto = NOT_EXTRACTED.join(" ");

  assert.match(texto, /imágenes/i);
  assert.match(texto, /textos literales/i);
  assert.match(texto, /licencia/i);
  assert.match(texto, /pixeles/i);
});

test("y qué sí, para que no parezca que la herramienta no sirve", () => {
  const texto = EXTRACTED.join(" ");

  assert.match(texto, /estructura/i);
  assert.match(texto, /oferta completa/i);
  assert.match(texto, /scripts/i);
});
