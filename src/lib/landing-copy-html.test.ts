import assert from "node:assert/strict";
import { test } from "node:test";

import {
  absolutize,
  applyTexts,
  batchTexts,
  bodyOf,
  buildTextPrompt,
  collectImages,
  absolutizeCss,
  closeOpenTags,
  cutAtTag,
  dropHidingRules,
  extractTexts,
  hasSubstance,
  isChrome,
  neutralizeLinks,
  sanitizeCss,
  sanitizeHtml,
  reveal,
  scopeCss,
  stripChrome,
  unlazy,
  autoplayVideos,
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

/* ------------------- Lo que estaba escondido esperando JS ------------------- */

/*
 * Los constructores animan la entrada de cada bloque: lo dejan invisible en el
 * CSS y su JavaScript le quita la clase al hacer scroll. La copia no lleva ese
 * JavaScript, así que la página entera se queda en `opacity: 0` — con su
 * maqueta, su texto y sus imágenes, todo bien generado y todo invisible.
 */
test("las clases de «sin revelar» se quitan", () => {
  const html = '<div class="gps gpsil gps-lazy hero">Hola</div>';
  const out = reveal(html);

  assert.ok(!out.includes("gps-lazy"));
  assert.match(out, /gps/);
  assert.match(out, /hero/);
});

test("los atributos de animación también", () => {
  assert.ok(!reveal('<div data-aos="fade-up" class="a">x</div>').includes("data-aos"));
  assert.ok(!reveal('<div display-init="hide">x</div>').includes("display-init"));
});

/* Palabra entera: `reveal` dentro de `revealed-box` es otra clase. */
test("no se lleva por delante una clase que solo se parece", () => {
  assert.match(reveal('<div class="revealed-box">x</div>'), /revealed-box/);
});

test("lo que no lleva marcas no se toca", () => {
  const html = '<div class="hero grande">Hola</div>';
  assert.equal(reveal(html), html);
});

/* ------------------------- Y las reglas que esconden ------------------------ */

test("la regla que esconde esperando JS se cae", () => {
  const css = ".gpsil .gps-lazy{opacity:0!important} .hero{color:red}";
  const out = dropHidingRules(css);

  assert.ok(!out.includes("opacity:0"));
  assert.match(out, /\.hero\{color:red\}/);
});

/*
 * Esconder es legítimo: un menú cerrado, un aviso de cookies, media carrusel.
 * Quitarlas todas dejaría la página con todo abierto encima de todo.
 */
test("una regla que esconde sin marca de animación se queda", () => {
  const css = ".menu-cerrado{display:none} .aviso{visibility:hidden}";
  assert.equal(dropHidingRules(css), css);
});

test("una regla con marca que no esconde tampoco se cae", () => {
  const css = ".gps-lazy{transition:opacity .3s}";
  assert.equal(dropHidingRules(css), css);
});

/* ------------------------ Solo el texto, y en su sitio ---------------------- */

const SECCION_TEXTO = '<div class="hero"><h1>Adelgaza ya</h1><p>Con <b>colágeno</b> real.</p></div>';

/*
 * Pedirle al modelo el marcado entero no funciona: ciento cincuenta mil
 * caracteres no caben en la respuesta, y cada vez que lo devuelve hay una
 * posibilidad de que lo devuelva distinto — y entonces la copia deja de
 * parecerse. Mandando solo las frases, la maqueta es la misma por construcción.
 */
test("se sacan las frases, no el marcado", () => {
  assert.deepEqual(extractTexts(SECCION_TEXTO), ["Adelgaza ya", "Con", "colágeno", "real."]);
});

test("los espacios y los símbolos sueltos no se mandan a traducir", () => {
  assert.deepEqual(extractTexts("<div>  </div><span>·</span><p>Hola</p>"), ["Hola"]);
});

test("volver a colocarlos deja el marcado idéntico", () => {
  const nuevos = ["Deshínchate ya", "Con", "magnesio", "de verdad."];
  const out = applyTexts(SECCION_TEXTO, nuevos);

  assert.match(out, /<div class="hero"><h1>Deshínchate ya<\/h1>/);
  assert.match(out, /<b>magnesio<\/b>/);
  assert.deepEqual(extractTexts(out), nuevos);
});

/* En `<b>hola</b> mundo`, el espacio de antes de «mundo» es parte del marcado. */
test("los espacios de alrededor se conservan", () => {
  assert.equal(applyTexts("<p><b>hola</b> mundo</p>", ["adiós", "tierra"]), "<p><b>adiós</b> tierra</p>");
});

/*
 * Un hueco a medias es una frase en el idioma equivocado y se ve. Un hueco vacío
 * es un trozo de página que desaparece, y eso no.
 */
test("si vuelven menos textos, los que faltan se quedan como estaban", () => {
  const out = applyTexts(SECCION_TEXTO, ["Deshínchate ya"]);

  assert.match(out, /Deshínchate ya/);
  assert.match(out, /colágeno/);
});

test("sin ningún texto devuelto no se vacía nada", () => {
  assert.equal(applyTexts(SECCION_TEXTO, []), SECCION_TEXTO);
});

test("una sección sin texto no da trabajo", () => {
  assert.deepEqual(extractTexts('<div class="separador"></div>'), []);
});

test("los textos van numerados, para poder devolverlos a su sitio", () => {
  const prompt = buildTextPrompt({
    texts: ["Adelgaza ya", "Con colágeno"],
    context: "Producto: Naturox",
    language: "español de Chile",
  });

  assert.match(prompt, /1\. Adelgaza ya/);
  assert.match(prompt, /2\. Con colágeno/);
  assert.match(prompt, /español de Chile/);
});

test("se pide conservar el enfoque y la longitud", () => {
  const prompt = buildTextPrompt({ texts: ["x"], context: "y", language: "es" });

  assert.match(prompt, /El enfoque y la idea de cada frase/);
  assert.match(prompt, /longitud aproximada/);
});

/* Reescribir lo que ya vale es cambiar por cambiar. */
test("lo que ya sirve se devuelve tal cual", () => {
  assert.match(buildTextPrompt({ texts: ["x"], context: "y", language: "es" }), /tal cual/);
});

test("se pide traducir con intención, no palabra por palabra", () => {
  assert.match(buildTextPrompt({ texts: ["x"], context: "y", language: "es" }), /no palabra por palabra/);
});

/*
 * Una imagen moderna va dentro de un `<picture>` con varios `<source>` delante.
 * El navegador elige el primero que encaje y solo cae al `<img>` si ninguno
 * vale, así que arreglar solo el `<img>` no cambia nada: se sigue viendo el
 * hueco del `<source>`.
 */
test("los source de un picture también se despiertan", () => {
  const html =
    '<picture><source media="(max-width:767px)" data-srcset="/movil.webp" srcset="data:image/svg+xml;base64,A"><img src="data:image/gif;base64,A" data-src="/grande.jpg"></picture>';

  const out = unlazy(html);

  assert.match(out, /srcset="\/movil\.webp"/);
  assert.match(out, /src="\/grande\.jpg"/);
  assert.ok(!out.includes("base64"));
});

test("un source que ya trae su srcset no se toca", () => {
  const html = '<source media="(max-width:767px)" srcset="/movil.webp">';
  assert.equal(unlazy(html), html);
});

/* ------------------------------ La página entera ---------------------------- */

test("se coge lo que hay dentro del cuerpo", () => {
  const html = "<html><head><title>x</title></head><body><div>Hola</div></body></html>";
  assert.equal(bodyOf(html), "<div>Hola</div>");
});

test("un fragmento sin cuerpo se devuelve tal cual", () => {
  assert.equal(bodyOf("<div>Hola</div>"), "<div>Hola</div>");
});

/*
 * Partir la página en secciones y volver a montarla **cambia la página**: cada
 * trozo acaba envuelto en un contenedor que no estaba, y el CSS de un
 * constructor mira la jerarquía. Con un envoltorio de más, la sección ya no es
 * hija de quien era y sale con otro ancho.
 */
test("el armazón de la tienda se va, el contenido se queda", () => {
  const html =
    '<div id="shopify-section-sections--1__header"><nav>menú</nav></div>' +
    '<div id="shopify-section-template--1__hero">El contenido</div>' +
    '<div id="shopify-section-sections--1__footer">pie</div>';

  const out = stripChrome(html);

  assert.match(out, /El contenido/);
  assert.ok(!out.includes("menú"));
  assert.ok(!out.includes("pie"));
});

test("los elementos que ya se llaman por su nombre también", () => {
  assert.equal(stripChrome("<header>a</header><main>b</main><footer>c</footer>"), "<main>b</main>");
});

/* ------------------------------ Las imágenes -------------------------------- */

test("se recogen las del marcado y las de los fondos", () => {
  const html = '<img src="/a.jpg"><source srcset="/b.jpg 1x, /c.jpg 2x">';
  const css = ".hero{background:url(/fondo.png)}";

  const found = collectImages(html, css);

  assert.ok(found.includes("/a.jpg"));
  assert.ok(found.includes("/fondo.png"));
});

/* Del srcset se coge la grande: es la que sirve para adaptarla después. */
test("del srcset se guarda la más grande", () => {
  const found = collectImages('<source srcset="/pequena.jpg 1x, /grande.jpg 2x">');

  assert.ok(found.includes("/grande.jpg"));
  assert.ok(!found.includes("/pequena.jpg"));
});

test("los huecos incrustados no son imágenes", () => {
  assert.deepEqual(collectImages('<img src="data:image/gif;base64,AAA">'), []);
});

test("no se repiten", () => {
  assert.deepEqual(collectImages('<img src="/a.jpg"><img src="/a.jpg">'), ["/a.jpg"]);
});

/*
 * Los elementos del constructor **son la maqueta**: esa página lleva 54
 * `<gp-row>`, que es lo que reparte las columnas y pone los anchos y los
 * márgenes. Tirarlos dejaba el contenido suelto a ancho completo — exactamente
 * lo que se veía.
 */
test("los elementos del constructor se conservan", () => {
  const html = '<gp-row class="gp-flex"><gp-button>Comprar</gp-button></gp-row>';
  assert.equal(sanitizeHtml(html), html);
});

/* Sin su JavaScript son cajas con estilos, igual que un div: no ejecutan nada. */
test("pero siguen sin poder ejecutar nada", () => {
  const limpio = sanitizeHtml('<gp-row onclick="robar()"><script>alert(1)</script></gp-row>');

  assert.ok(!limpio.includes("onclick"));
  assert.ok(!limpio.includes("alert"));
  assert.match(limpio, /<gp-row><\/gp-row>/);
});

/* El guion en el nombre es lo que la norma exige: sin él es una etiqueta inventada. */
test("una etiqueta inventada sin guion sigue cayéndose", () => {
  assert.equal(sanitizeHtml("<marquee>Hola</marquee>"), "Hola");
});

test("el vídeo se queda: en una página de venta es la demo", () => {
  const html = '<video src="/demo.mp4" controls></video>';
  assert.equal(sanitizeHtml(html), html);
});

/*
 * Sin autoplay, un vídeo de fondo se queda en un rectángulo negro — justo donde
 * el original enseña dos fotos. Con sonido sería lo peor que puede hacer una
 * página, así que se permite solo en silencio: la misma regla del navegador.
 */
test("un vídeo mudo puede arrancar solo; con sonido no", () => {
  assert.match(sanitizeHtml("<video autoplay muted loop></video>"), /autoplay/);
  assert.ok(!sanitizeHtml("<video autoplay></video>").includes("autoplay"));
});

test("los atributos sin valor del vídeo se conservan", () => {
  const limpio = sanitizeHtml("<video controls loop playsinline></video>");

  assert.match(limpio, /controls/);
  assert.match(limpio, /loop/);
  assert.match(limpio, /playsinline/);
});

/*
 * Los vídeos de esa página son `<video data-src="….webm">` **sin `src`**,
 * esperando a que su JavaScript lo mueva. Sin despertarlos se quedaban en un
 * rectángulo negro con controles y nada que reproducir.
 */
test("los vídeos perezosos también se despiertan", () => {
  const html = '<video data-src="https://cdn/x.webm" loop muted autoplay playsinline></video>';
  const out = unlazy(html);

  assert.match(out, /src="https:\/\/cdn\/x\.webm"/);
});

/* `poster` a secas hace que el navegador cargue la cadena vacía y enseñe el
 * icono de imagen rota encima del vídeo. */
test("una dirección sin valor no se conserva", () => {
  const limpio = sanitizeHtml("<video poster src></video>");

  assert.ok(!limpio.includes("poster"));
  assert.ok(!limpio.includes("src"));
});

/* En una página de venta el .webm de fondo es la demo: hay que tenerlo a mano. */
test("los vídeos se recogen igual que las imágenes", () => {
  const found = collectImages(
    '<video src="/demo.webm" poster="/cartel.jpg"></video><img src="/foto.jpg">',
  );

  assert.ok(found.includes("/demo.webm"));
  assert.ok(found.includes("/cartel.jpg"));
  assert.ok(found.includes("/foto.jpg"));
});

/*
 * El «añadir el src que falta» decía `<img` a secas, así que a un `<video
 * data-src="….webm">` —que no trae `src` ninguno— no se le ponía nada. Los once
 * vídeos de la página se quedaban fuera y nada fallaba.
 */
test("el src que falta se añade con su propia etiqueta", () => {
  assert.match(unlazy('<video data-src="/x.webm"></video>'), /<video src="\/x\.webm"/);
  assert.match(unlazy('<source data-srcset="/y.webp 1x">'), /<source srcset="\/y\.webp 1x"/);
});

/* ------------------------------- Las tandas --------------------------------- */

/*
 * Lo que no cabe es la **respuesta**, y mide lo que midan los textos. Ciento
 * veinte frases cortas caben de sobra; ciento veinte párrafos largos no — y
 * cuando no cabe, el modelo se corta a mitad y la tanda entera se queda sin
 * adaptar.
 */
test("se reparte por caracteres, no por número", () => {
  const largos = Array.from({ length: 10 }, () => "x".repeat(1_000));
  const tandas = batchTexts(largos, { maxChars: 2_500 });

  assert.ok(tandas.length >= 4);
  for (const tanda of tandas) {
    assert.ok(tanda.join("").length <= 3_000, "una tanda se pasó del tope");
  }
});

/* Mil frases de tres letras caben, pero el modelo pierde la cuenta al numerarlas. */
test("y también hay tope de cuántas", () => {
  const cortos = Array.from({ length: 200 }, () => "hola");
  const tandas = batchTexts(cortos, { maxChars: 100_000, maxItems: 60 });

  assert.equal(tandas.length, 4);
  assert.ok(tandas.every((tanda) => tanda.length <= 60));
});

/* Partir una frase por la mitad daría dos sin sentido: traducir media es peor. */
test("un texto que solo ya se pasa va igualmente entero", () => {
  const tandas = batchTexts(["x".repeat(9_000)], { maxChars: 1_000 });

  assert.equal(tandas.length, 1);
  assert.equal(tandas[0][0].length, 9_000);
});

test("ninguna frase se pierde ni cambia de orden", () => {
  const textos = Array.from({ length: 137 }, (_, i) => `frase ${i}`);

  assert.deepEqual(batchTexts(textos, { maxChars: 200 }).flat(), textos);
});

test("sin textos no hay tandas", () => {
  assert.deepEqual(batchTexts([]), []);
});

/* ------------------------- Los vídeos, como un GIF ------------------------- */

test("un vídeo con controles sale sin ellos y arrancando solo", () => {
  /*
   * En la original arrancan solos y se repiten; en la copia salían con la barra
   * de controles y parados, esperando un clic que nadie da. La página deja de
   * parecerse justo en lo que más llama la atención.
   */
  const out = autoplayVideos('<video controls preload="none" src="a.webm"></video>');

  assert.ok(!out.includes("controls"));
  assert.ok(out.includes("autoplay"));
  assert.ok(out.includes("loop"));
});

test("siempre lleva muted, porque sin él no arranca", () => {
  // No es una preferencia: todos los navegadores bloquean la reproducción
  // automática con sonido, y el vídeo se queda en el primer fotograma sin dar
  // ningún error.
  assert.ok(autoplayVideos("<video src=\"a.webm\"></video>").includes("muted"));
});

test("siempre lleva playsinline, por el iPhone", () => {
  // Sin él, iOS abre el vídeo a pantalla completa en cuanto empieza — y en un
  // anuncio eso echa a la persona de la página.
  assert.ok(autoplayVideos("<video src=\"a.webm\"></video>").includes("playsinline"));
});

test("un atributo que ya estaba no se duplica", () => {
  /*
   * Un atributo repetido no da error: el navegador se queda con el primero. Si
   * el original traía `muted="false"`, añadir otro detrás no cambiaría nada y
   * el vídeo seguiría sin arrancar.
   */
  const out = autoplayVideos('<video muted="false" loop src="a.webm"></video>');

  assert.equal(out.match(/muted/g)?.length, 1);
  assert.equal(out.match(/loop/g)?.length, 1);
  assert.ok(!out.includes('muted="false"'));
});

test("el poster se quita", () => {
  // Es la imagen fija de antes del play: con reproducción automática solo
  // produce un parpadeo al arrancar.
  assert.ok(!autoplayVideos('<video poster="p.jpg" src="a.webm"></video>').includes("poster"));
});

test("las clases y el estilo se conservan", () => {
  // Son los que le dan el tamaño y la posición: perderlos lo dejaría suelto en
  // mitad de la sección, que es peor que un reproductor parado.
  const out = autoplayVideos('<video class="hero" style="width:100%" src="a.webm"></video>');

  assert.ok(out.includes('class="hero"'));
  assert.ok(out.includes('style="width:100%"'));
});

test("una etiqueta que se cierra sola sigue siendo válida", () => {
  const out = autoplayVideos('<video src="a.webm" />');

  assert.ok(out.endsWith("playsinline>"));
  assert.ok(!out.includes("/>"));
});

test("el contenido de dentro no se toca", () => {
  // Las `<source>` de dentro son de donde sale el archivo: tocarlas dejaría el
  // vídeo sin nada que reproducir.
  const out = autoplayVideos('<video controls><source src="a.webm" type="video/webm"></video>');

  assert.ok(out.includes('<source src="a.webm" type="video/webm">'));
});

test("lo que no es un vídeo se queda igual", () => {
  const html = '<img src="a.png"><div controls>texto</div>';

  assert.equal(autoplayVideos(html), html);
});
