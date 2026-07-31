import { test } from "node:test";
import assert from "node:assert/strict";

import { htmlToText, pageTitle, scriptSources } from "./html-text.ts";

/* -------------------------------- Limpieza --------------------------------- */

test("el código de los scripts no acaba dentro del texto", () => {
  /*
   * Quitando solo las etiquetas, el JavaScript se queda en el texto y quien lo
   * lea después lo toma por contenido de la página.
   */
  const html = `<p>Hola</p><script>var precio = 49; alert("compra");</script><p>Adiós</p>`;

  const text = htmlToText(html);

  assert.ok(!text.includes("alert"));
  assert.ok(!text.includes("var precio"));
  assert.ok(text.includes("Hola"));
  assert.ok(text.includes("Adiós"));
});

test("los estilos y los SVG tampoco", () => {
  assert.equal(
    htmlToText(`<style>.a{color:red}</style><svg><path d="M0 0"/></svg><p>Texto</p>`),
    "Texto",
  );
});

test("los bloques se separan, para no pegar el titular con el párrafo", () => {
  // Sin el salto, «Titular» y «Cuerpo» se leen como una frase y se pierde dónde
  // acaba cada sección, que es lo que hay que entender de la página.
  assert.deepEqual(htmlToText("<h1>Titular</h1><p>Cuerpo</p>").split("\n"), [
    "Titular",
    "Cuerpo",
  ]);
});

test("las entidades se traducen, y el ampersand el último", () => {
  /*
   * El orden importa: convirtiendo `&amp;` primero, un `&amp;lt;` acabaría
   * siendo `<` en vez del texto literal `&lt;`.
   */
  assert.equal(htmlToText("<p>uno &amp; dos</p>"), "uno & dos");
  assert.equal(htmlToText("<p>&amp;lt;</p>"), "&lt;");
});

test("un comentario HTML no entra en el texto", () => {
  assert.equal(htmlToText("<!-- oculto --><p>visible</p>"), "visible");
});

test("un HTML vacío no rompe nada", () => {
  assert.equal(htmlToText(""), "");
  assert.equal(htmlToText("   "), "");
});

/* -------------------------------- Scripts ---------------------------------- */

test("saca los scripts con src, con protocolo o sin él", () => {
  const sources = scriptSources(`
    <script src="https://cdn.shopify.com/theme.js"></script>
    <script src="//connect.facebook.net/en_US/fbevents.js"></script>
  `);

  assert.equal(sources.length, 2);
  assert.ok(sources.some((src) => src.includes("fbevents")));
});

test("también los que van en línea, que es donde vive el pixel", () => {
  /*
   * El pixel de Meta se instala como código en línea que carga `fbevents.js`
   * desde dentro. Mirando solo los `src` se lo salta — justo el que más importa
   * detectar, porque es el que nunca hay que importar.
   */
  const sources = scriptSources(`<script>
    !function(f,b,e,v,n,t,s){}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '123456789');
  </script>`);

  assert.ok(sources.some((src) => src.includes("connect.facebook.net")));
});

test("una página sin scripts devuelve una lista vacía", () => {
  assert.deepEqual(scriptSources("<p>nada</p>"), []);
});

/* --------------------------------- Título ---------------------------------- */

test("el título, limpio de entidades", () => {
  assert.equal(pageTitle("<title>Naturox &amp; Co | Tienda</title>"), "Naturox & Co | Tienda");
  assert.equal(pageTitle("<html><body>sin título</body></html>"), "");
});
