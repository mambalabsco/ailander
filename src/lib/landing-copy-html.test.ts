import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCopyPrompt,
  hasSubstance,
  isChrome,
  keepsShape,
  neutralizeLinks,
  sanitizeCss,
  sanitizeHtml,
} from "./landing-copy-html.ts";

/* -------------------------------- La limpieza ------------------------------- */

/*
 * Este marcado viene de la web de otro y se sirve dentro de una página nuestra,
 * con nuestra sesión. Un script que venga dentro se ejecutaría con los permisos
 * de quien lo esté mirando.
 */
test("los scripts se van con su contenido", () => {
  const limpio = sanitizeHtml('<div>Hola<script>alert(1)</script></div>');

  assert.equal(limpio, "<div>Hola</div>");
  assert.ok(!limpio.includes("alert"));
});

test("un script sin cerrar tampoco se cuela", () => {
  assert.ok(!sanitizeHtml('<div><script src="https://mal/x.js">').includes("script"));
});

/*
 * El fallo que llenó una vista previa de CSS a la vista. Las secciones se
 * recortan por tamaño antes de llegar aquí, y ese recorte cae a veces dentro de
 * un `<style>`: sin etiqueta de cierre, la de apertura se quitaba sola y las
 * reglas se quedaban **como texto** en mitad de la página.
 */
test("un style cortado a la mitad no deja sus reglas como texto", () => {
  const cortado =
    '<div class="gps"><style>.gps [style*="--b:"]{border:var(--b)} .gps.gpsi:hover{color:red}';

  const limpio = sanitizeHtml(cortado);

  assert.equal(limpio, '<div class="gps">');
  assert.ok(!limpio.includes("border:var"));
});

test("un script cortado tampoco deja su código escrito", () => {
  const limpio = sanitizeHtml('<div>Hola<script>const secreto = "abc"; fetch(');

  assert.equal(limpio, "<div>Hola");
  assert.ok(!limpio.includes("secreto"));
});

/* Lo que está bien cerrado sigue funcionando igual: solo se cae lo colgante. */
test("lo que viene después de un style cerrado no se pierde", () => {
  const limpio = sanitizeHtml("<div>Antes<style>.a{color:red}</style><p>Después</p></div>");

  assert.equal(limpio, "<div>Antes<p>Después</p></div>");
});

test("los iframes y los objetos se van", () => {
  for (const tag of ["iframe", "object", "embed", "noscript"]) {
    const limpio = sanitizeHtml(`<div><${tag}>x</${tag}></div>`);
    assert.ok(!limpio.includes(tag), tag);
  }
});

/*
 * No es una lista de eventos concretos a propósito: `onbeforetoggle` existe, y
 * una lista cerrada se queda corta justo cuando aparece uno nuevo.
 */
test("ningún atributo que empiece por on sobrevive", () => {
  for (const attr of ["onclick", "onerror", "onload", "onbeforetoggle", "ONMOUSEOVER"]) {
    const limpio = sanitizeHtml(`<img src="x.png" ${attr}="robar()">`);
    assert.ok(!/on[a-z]+=/i.test(limpio), attr);
  }
});

test("un href con javascript: se cae y la etiqueta se queda", () => {
  const limpio = sanitizeHtml('<a href="javascript:alert(1)" class="cta">Comprar</a>');

  assert.ok(!limpio.includes("javascript"));
  assert.match(limpio, /<a class="cta">Comprar<\/a>/);
});

/* Los navegadores ignoran espacios y saltos dentro del esquema. */
test("el javascript: disfrazado tampoco pasa", () => {
  assert.ok(!sanitizeHtml('<a href="java\tscript:alert(1)">x</a>').includes("href"));
  assert.ok(!sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>').includes("href"));
});

/* `class` y `style` son justo lo que hace que la copia se parezca. */
test("las clases y los estilos se conservan", () => {
  const html = '<div class="hero big" style="background:#f00;padding:40px">Hola</div>';
  assert.equal(sanitizeHtml(html), html);
});

test("un estilo con javascript dentro se cae entero", () => {
  const limpio = sanitizeHtml('<div style="background:url(javascript:x)">a</div>');
  assert.ok(!limpio.includes("style"));
});

test("las etiquetas que no están en la lista se caen y su texto se queda", () => {
  assert.equal(sanitizeHtml("<marquee>Hola</marquee>"), "Hola");
});

test("un formulario no se sirve", () => {
  const limpio = sanitizeHtml('<form action="https://mal/x"><input name="tarjeta"></form>');

  assert.ok(!limpio.includes("form"));
  assert.ok(!limpio.includes("input"));
});

test("los comentarios se van", () => {
  assert.equal(sanitizeHtml("<div><!-- secreto -->Hola</div>"), "<div>Hola</div>");
});

test("las direcciones normales se quedan", () => {
  const html = '<a href="https://mitienda.com/p"><img src="/fotos/1.jpg" alt="Envase"></a>';
  assert.equal(sanitizeHtml(html), html);
});

/* --------------------------------- El CSS ----------------------------------- */

/* Una regla sobre `body` dentro de una página copiada repintaría la plataforma. */
test("las reglas sobre html y body se caen", () => {
  const css = sanitizeCss("body { background: black } .hero { color: red }");

  assert.ok(!css.includes("background: black"));
  assert.match(css, /\.hero/);
});

test("los @import se caen: traerían una hoja de otro sitio", () => {
  assert.ok(!sanitizeCss('@import url("https://mal/x.css"); .a{color:red}').includes("@import"));
});

test("lo que da el aspecto se queda tal cual", () => {
  const css = ".hero { display: grid; grid-template-columns: 1fr 2fr; gap: 24px }";
  assert.equal(sanitizeCss(css), css);
});

/* ----------------------------- Que siga siendo ella -------------------------- */

const SECCION = '<div class="hero"><h1>Antes</h1><p>Uno</p><p>Dos</p></div>';

test("cambiar solo el texto conserva la forma", () => {
  const otro = '<div class="hero"><h1>Después</h1><p>Tres</p><p>Cuatro</p></div>';
  assert.equal(keepsShape(SECCION, otro).ok, true);
});

/*
 * A veces el modelo devuelve **su** versión del marcado. Eso no da error: da una
 * página que ya no se parece a la que se quería copiar.
 */
test("una reescritura del marcado se detecta", () => {
  const suyo = "<section><h2>Después</h2></section>";
  const verdict = keepsShape(SECCION, suyo);

  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /marcado cambió/);
});

test("quitar un br al traducir no cuenta como reescritura", () => {
  const con = '<div class="hero"><p>Uno<br>Dos<br>Tres<br>Cuatro<br>Cinco</p><p>a</p><p>b</p></div>';
  const sin = '<div class="hero"><p>Uno<br>Dos<br>Tres<br>Cuatro</p><p>a</p><p>b</p></div>';

  assert.equal(keepsShape(con, sin).ok, true);
});

test("meter etiquetas que no estaban también se detecta", () => {
  const inflado = SECCION.replace("</div>", "<p>a</p><p>b</p><p>c</p><p>d</p></div>");
  assert.equal(keepsShape(SECCION, inflado).ok, false);
});

test("un fragmento sin etiquetas no se marca como roto", () => {
  assert.equal(keepsShape("solo texto", "otro texto").ok, true);
});

/* -------------------------------- El encargo -------------------------------- */

test("se le pide el mismo marcado, no una versión suya", () => {
  const prompt = buildCopyPrompt({ html: SECCION, context: "Producto: Naturox", language: "español de Chile" });

  assert.match(prompt, /exactamente el mismo HTML/);
  assert.match(prompt, /mismo número de elementos/);
  assert.match(prompt, /Producto: Naturox/);
});

/*
 * Un texto del doble de largo rompe el diseño que se está copiando, que es justo
 * lo que se venía a conservar.
 */
test("se le pide respetar la longitud de cada texto", () => {
  assert.match(
    buildCopyPrompt({ html: SECCION, context: "x", language: "español" }),
    /longitud aproximada/,
  );
});

test("se le dice el idioma y que traduzca con intención", () => {
  const prompt = buildCopyPrompt({ html: SECCION, context: "x", language: "español de México" });

  assert.match(prompt, /español de México/);
  assert.match(prompt, /no palabra por palabra/);
});

test("nada de lo del otro producto se arrastra", () => {
  assert.match(buildCopyPrompt({ html: SECCION, context: "x", language: "es" }), /ni estudios/);
});

/* ------------------------------- Los enlaces -------------------------------- */

/*
 * Los botones de una página de venta llevan al carrito **de esa tienda**.
 * Copiarla tal cual da una página tuya cuyo «Comprar» convierte para el
 * competidor — y no falla en ningún sitio, la página se ve perfecta.
 */
test("los enlaces dejan de apuntar a la tienda copiada", () => {
  const { html, changed } = neutralizeLinks(
    '<a href="https://otra.com/cart" class="cta">Comprar</a><a href="/products/x">Ver</a>',
  );

  assert.ok(!html.includes("otra.com"));
  assert.ok(!html.includes("/products/x"));
  assert.equal(changed, 2);
  assert.match(html, /class="cta"/);
});

/* Un ancla es navegación dentro de la misma página: sigue valiendo. */
test("las anclas internas se quedan", () => {
  const { html, changed } = neutralizeLinks('<a href="#oferta">Ir a la oferta</a>');

  assert.match(html, /href="#oferta"/);
  assert.equal(changed, 0);
});

test("un enlace sin href no se toca", () => {
  assert.equal(neutralizeLinks("<a>Texto</a>").changed, 0);
});

/* ---------------------------- Lo que no se copia ---------------------------- */

/*
 * La cabecera de un tema de Shopify son veinte mil caracteres de menú
 * desplegable, con los enlaces y el logo de otro.
 */
test("el armazón de la tienda no es la landing", () => {
  for (const type of ["announcement-bar", "header", "footer", "main-nav", "cookie-banner"]) {
    assert.equal(isChrome(type), true, type);
  }
});

test("lo que sí es la página se copia", () => {
  for (const type of ["hero", "slider", "rich-text", "faq", "testimonios"]) {
    assert.equal(isChrome(type), false, type);
  }
});

/*
 * Después de limpiar puede no quedar nada: una franja que solo era un script de
 * seguimiento. Guardarla mete huecos vacíos en mitad de la página.
 */
test("una sección que se quedó en nada no se guarda", () => {
  assert.equal(hasSubstance('<div class="x"></div>'), false);
  assert.equal(hasSubstance("   "), false);
});

test("una sección con texto o con imagen sí", () => {
  assert.equal(hasSubstance("<p>Volver a caminar sin pensarlo</p>"), true);
  assert.equal(hasSubstance('<div><img src="/a.jpg" alt=""></div>'), true);
});
