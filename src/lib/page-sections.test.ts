import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSS_LIMIT,
  relevantCss,
  selectorsIn,
  splitShopifySections,
  trimSectionHtml,
} from "./page-sections.ts";

const PAGINA = `<body>
<div id="shopify-section-sections--1__announcement" class="shopify-section barra">
  <p class="barra__texto">Envío gratis</p>
</div>
<div id="shopify-section-template--123__hero" class="shopify-section hero">
  <h1 class="hero__titulo">Daily Support</h1>
</div>
<section id="shopify-section-template--123__comparison" class="shopify-section tabla">
  <table class="tabla__cuerpo"></table>
</section>
</body>`;

/* ------------------------------- Las secciones ----------------------------- */

test("la página se parte en sus secciones", () => {
  const secciones = splitShopifySections(PAGINA);

  assert.equal(secciones.length, 3);
  assert.deepEqual(
    secciones.map((section) => section.type),
    ["announcement", "hero", "comparison"],
  );
});

test("el número de plantilla se descarta: cambia en cada tienda", () => {
  const [, hero] = splitShopifySections(PAGINA);

  assert.equal(hero.type, "hero");
  assert.equal(hero.id, "template--123__hero");
});

test("cada trozo llega entero y sin el de al lado", () => {
  const [, hero] = splitShopifySections(PAGINA);

  assert.match(hero.html, /Daily Support/);
  assert.ok(!hero.html.includes("Envío gratis"), "se coló la anterior");
  assert.ok(!hero.html.includes("tabla__cuerpo"), "se coló la siguiente");
});

test("una sección sin sufijo conserva su nombre", () => {
  const [seccion] = splitShopifySections(`<div id="shopify-section-header">x</div>`);

  assert.equal(seccion.type, "header");
});

test("una página sin secciones de Shopify no devuelve nada", () => {
  assert.deepEqual(splitShopifySections("<div>hola</div>"), []);
});

/* ---------------------------------- El estilo ------------------------------ */

const HOJA = `
:root { --color-fondo: #fff8f5; --radio: 8px }
.hero { display: grid; grid-template-columns: 1fr 1fr }
.hero__titulo { font-size: 3rem }
.hero-slider { display: none }
.carrito__total { font-weight: 700 }
@media (max-width: 749px) { .hero { grid-template-columns: 1fr } }
@media (max-width: 749px) { .carrito__total { font-size: 12px } }
`;

test("solo se conservan las reglas que pintan ese trozo", () => {
  const css = relevantCss(HOJA, selectorsIn(`<div class="hero"><h1 class="hero__titulo"></h1></div>`));

  assert.match(css, /\.hero\s*\{/);
  assert.match(css, /hero__titulo/);
  assert.ok(!css.includes("carrito__total"), "se coló una regla del carrito");
});

test("una clase no se lleva la de otro componente que empieza igual", () => {
  // `.hero` no debe arrastrar `.hero-slider`, que suele ser otra cosa con otras
  // medidas y desordenaría lo que se está intentando copiar.
  const css = relevantCss(HOJA, selectorsIn(`<div class="hero"></div>`));

  assert.ok(!css.includes("hero-slider"));
});

test("las variables del tema se conservan siempre", () => {
  // Sin ellas media regla queda sin resolver.
  const css = relevantCss(HOJA, selectorsIn(`<div class="hero"></div>`));

  assert.match(css, /--color-fondo/);
});

test("la consulta de medios que toca ese trozo se conserva entera", () => {
  // Es donde vive que dos columnas caigan a una en el móvil, que es donde se
  // compra.
  const css = relevantCss(HOJA, selectorsIn(`<div class="hero"></div>`));

  assert.match(css, /@media[^{]*\{[^}]*\.hero/);
  assert.ok(!/@media[^{]*\{[^}]*carrito/.test(css), "se coló la del carrito");
});

test("no se pasa del tope", () => {
  const gorda = Array.from({ length: 4000 }, (_, i) => `.hero { padding: ${i}px }`).join("\n");
  const css = relevantCss(gorda, selectorsIn(`<div class="hero"></div>`));

  assert.ok(css.length <= CSS_LIMIT + 30, `salió ${css.length}`);
  assert.match(css, /recortado/);
});

test("los identificadores también cuentan como selector", () => {
  const selectores = selectorsIn(`<div id="oferta" class="caja grande"></div>`);

  assert.deepEqual([...selectores].sort(), ["#oferta", ".caja", ".grande"]);
});

/* -------------------------------- El marcado ------------------------------- */

test("se quita lo que no cuenta cómo se ve", () => {
  const html = trimSectionHtml(`
    <div class="hero">
      <script>window.x = 1</script>
      <!-- un comentario -->
      <noscript><img src="x"></noscript>
      <svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>
      <h1>Hola</h1>
    </div>`);

  assert.ok(!html.includes("window.x"));
  assert.ok(!html.includes("comentario"));
  assert.ok(!html.includes("noscript"));
  assert.match(html, /<svg><!-- icono --><\/svg>/, "el icono se resume, no se borra");
  assert.match(html, /<h1>Hola<\/h1>/);
});

test("un marcado enorme se recorta y lo dice", () => {
  const html = trimSectionHtml(`<div>${"x".repeat(30_000)}</div>`, 1_000);

  assert.ok(html.length < 1_100);
  assert.match(html, /recortado/);
});
