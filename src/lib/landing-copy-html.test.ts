import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCopyPrompt,
  keepsShape,
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
