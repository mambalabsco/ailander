import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCopyPrompt,
  absolutize,
  absolutizeCss,
  closeOpenTags,
  cutAtTag,
  hasSubstance,
  isChrome,
  keepsShape,
  neutralizeLinks,
  sanitizeCss,
  sanitizeHtml,
  scopeCss,
  unlazy,
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

/*
 * El segundo fallo del copiador. El recorte por tamaño cae donde cae: a veces en
 * mitad de un atributo, dejando `<div data-x style="--jc:` sin su `>`. El
 * limpiador solo reconoce etiquetas completas, así que eso pasaba como texto — y
 * como texto se pintaba, escrito en mitad de la página.
 */
test("una etiqueta cortada a mitad de un atributo no queda escrita", () => {
  const cortado = '<div class="a">Hola</div><div data-same-height style="--jc:';
  const limpio = sanitizeHtml(cortado);

  assert.equal(limpio, '<div class="a">Hola</div>');
  assert.ok(!limpio.includes("--jc"));
});

test("un `<` que es texto de verdad no se lleva la página por delante", () => {
  assert.equal(sanitizeHtml("<p>5 < 10 y ya</p>"), "<p>5 < 10 y ya</p>");
});

/* ---------------------------- Cerrar lo abierto ----------------------------- */

/*
 * El navegador cierra solo lo que quedó abierto **al final del documento**, así
 * que el resto de la página acaba metido dentro: hereda su ancho, su fondo y su
 * relleno. No da error; da una página que se ve mal por un motivo que no está en
 * las secciones que se ven mal.
 */
test("lo que el recorte dejó abierto se cierra", () => {
  assert.equal(closeOpenTags('<div class="a"><p>Hola'), '<div class="a"><p>Hola</p></div>');
});

test("lo que ya estaba equilibrado no se toca", () => {
  const html = "<div><p>Hola</p></div>";
  assert.equal(closeOpenTags(html), html);
});

test("las que no llevan cierre no cuentan", () => {
  assert.equal(closeOpenTags("<p>Uno<br>Dos</p>"), "<p>Uno<br>Dos</p>");
  assert.equal(closeOpenTags('<div><img src="a.jpg">'), '<div><img src="a.jpg"></div>');
});

test("una autocerrada tampoco", () => {
  assert.equal(closeOpenTags("<div><br/></div>"), "<div><br/></div>");
});

/* Un cierre de más no puede cerrar lo que no abrió. */
test("un cierre suelto no descuadra el resto", () => {
  assert.equal(closeOpenTags("</span><div>Hola"), "</span><div>Hola</div>");
});

test("se cierran en orden inverso, que es el único que vale", () => {
  assert.equal(closeOpenTags("<section><div><p>x"), "<section><div><p>x</p></div></section>");
});

/* ---------------------------- Recortar sin romper --------------------------- */

/*
 * El corte por número de caracteres cae donde cae, y en una página real cayó a
 * mitad de un atributo. Cortando por el último `>` que quepa, lo que queda
 * siempre es marcado entero.
 */
test("se corta por el final de una etiqueta, no en medio", () => {
  const html = '<div class="a">Hola</div><div data-x style="--jc:centro">Adiós</div>';

  assert.equal(cutAtTag(html, 30), '<div class="a">Hola</div>');
});

test("lo que cabe entero no se toca", () => {
  const html = "<p>Corto</p>";
  assert.equal(cutAtTag(html, 500), html);
});

/* Un trozo de atributo suelto es peor que nada: se pinta como texto. */
test("sin ninguna etiqueta completa no se devuelve el trozo", () => {
  assert.equal(cutAtTag('<div data-muy-largo="' + "x".repeat(50) + '">', 20), "");
});

/* ------------------------------- Atar el CSS -------------------------------- */

/*
 * El CSS de una página entera trae `.grid`, `.button`, `h2`. Metido tal cual en
 * la plataforma repinta **la plataforma**, sin que nada falle y sin ninguna
 * pista de por qué.
 */
test("cada selector queda dentro del contenedor", () => {
  const css = scopeCss(".hero { color: red } h2 { font-size: 20px }", ".copiado");

  assert.match(css, /\.copiado \.hero\{/);
  assert.match(css, /\.copiado h2\{/);
});

test("una lista de selectores se ata entera, no solo el primero", () => {
  const css = scopeCss(".a, .b { color: red }", ".copiado");

  assert.match(css, /\.copiado \.a, \.copiado \.b\{/);
});

/*
 * Las variables de `:root` son las que usa el marcado copiado: quitarlas dejaría
 * la página sin ninguno de sus colores.
 */
test("las variables de :root se quedan, atadas al contenedor", () => {
  const css = scopeCss(":root { --color: red }", ".copiado");

  assert.match(css, /\.copiado\{ --color: red \}/);
  assert.ok(!css.includes(":root"));
});

test("html y body se convierten en el contenedor en vez de repintar la página", () => {
  assert.match(scopeCss("body { background: black }", ".copiado"), /\.copiado\{/);
});

test("las reglas de arroba no se rompen", () => {
  const css = scopeCss("@media (max-width: 600px) { .hero { display: none } }", ".copiado");

  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.copiado \.hero/);
});

test("los keyframes siguen siendo suyos", () => {
  const css = scopeCss("@keyframes girar { from { opacity: 0 } }", ".copiado");
  assert.match(css, /@keyframes girar/);
});

/* --------------------------- Las imágenes perezosas ------------------------- */

/*
 * En una página moderna el `src` de una imagen **no es la imagen**: es un hueco
 * transparente y la dirección real está en `data-src`, esperando al JavaScript
 * de la página. La copia no lleva ese JavaScript, así que se quedaban los quince
 * huecos — con su tamaño y su `alt`, sin dar ningún error.
 */
test("la dirección real sale de data-src", () => {
  const html = '<img src="data:image/svg+xml;base64,AAA" data-src="/cdn/foto.jpg" alt="x">';

  assert.match(unlazy(html), /src="\/cdn\/foto\.jpg"/);
  assert.ok(!unlazy(html).includes("base64"));
});

test("también el srcset perezoso", () => {
  const html = '<img src="data:image/gif;base64,A" data-srcset="/a.jpg 1x, /b.jpg 2x">';
  assert.match(unlazy(html), /srcset="\/a\.jpg 1x, \/b\.jpg 2x"/);
});

/* Un `data-src` que también es un hueco no sirve de nada. */
test("un data-src que es otro hueco no se asciende", () => {
  const html = '<img src="/real.jpg" data-src="data:image/gif;base64,AAA">';
  assert.match(unlazy(html), /src="\/real\.jpg"/);
});

test("una imagen normal no se toca", () => {
  const html = '<img src="/foto.jpg" alt="x">';
  assert.equal(unlazy(html), html);
});

/* ------------------------------ Las direcciones ----------------------------- */

/*
 * `/cdn/shop/files/x.jpg` servido desde otro dominio se pide **a ese otro
 * dominio** y no existe: la página sale con quince huecos y un 404 por cada uno.
 */
test("las direcciones de raíz se atan a su tienda", () => {
  const html = '<img src="/cdn/shop/x.jpg"><a href="/products/y">Ver</a>';
  const out = absolutize(html, "https://tienda.com");

  assert.match(out, /src="https:\/\/tienda\.com\/cdn\/shop\/x\.jpg"/);
  assert.match(out, /href="https:\/\/tienda\.com\/products\/y"/);
});

test("las de protocolo relativo también", () => {
  assert.match(absolutize('<img src="//cdn.shopify.com/x.jpg">', "https://t.com"), /https:\/\/cdn\.shopify\.com/);
});

test("las que ya son absolutas y los datos incrustados se quedan", () => {
  const html = '<img src="https://otro.com/x.jpg"><img src="data:image/png;base64,AA">';
  assert.equal(absolutize(html, "https://t.com"), html);
});

test("un ancla no se convierte en una dirección", () => {
  assert.equal(absolutize('<a href="#oferta">x</a>', "https://t.com"), '<a href="#oferta">x</a>');
});

test("cada trozo del srcset se ata por separado", () => {
  const out = absolutize('<img srcset="/a.jpg 1x, /b.jpg 2x">', "https://t.com");

  assert.match(out, /https:\/\/t\.com\/a\.jpg 1x/);
  assert.match(out, /https:\/\/t\.com\/b\.jpg 2x/);
});

test("los fondos del CSS también", () => {
  assert.match(absolutizeCss(".a{background:url(/f/x.png)}", "https://t.com"), /url\(https:\/\/t\.com\/f\/x\.png\)/);
});

/* `url(#algo)` apunta a una máscara del propio documento: hacerla absoluta la rompe. */
test("una referencia interna del SVG no se toca", () => {
  const css = ".a{fill:url(#Shape-Arch)}";
  assert.equal(absolutizeCss(css, "https://t.com"), css);
});

/*
 * El fallo que dejó la copia sin imágenes aunque `unlazy` "funcionaba": `\b`
 * también encaja **dentro** de otro atributo. Esta página trae `base-src`, así
 * que se leía y se escribía ese en vez del de verdad — la imagen seguía siendo
 * el hueco y todo parecía correcto.
 */
test("un atributo que acaba en src no se confunde con src", () => {
  const html = '<img base-src="/pequena.jpg" src="data:image/gif;base64,A" data-src="/grande.jpg">';
  const out = unlazy(html);

  assert.match(out, /\ssrc="\/grande\.jpg"/);
  assert.match(out, /base-src="\/pequena\.jpg"/);
  assert.ok(!out.includes("base64"));
});

test("y tampoco al hacer absolutas las direcciones", () => {
  const out = absolutize('<img base-src="/a.jpg" src="/b.jpg">', "https://t.com");

  assert.match(out, /base-src="\/a\.jpg"/);
  assert.match(out, /\ssrc="https:\/\/t\.com\/b\.jpg"/);
});
