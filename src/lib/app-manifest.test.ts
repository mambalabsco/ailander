import assert from "node:assert/strict";
import { test } from "node:test";

import { imagesFrom, manifestUrlFrom, readAppManifest } from "./app-manifest.ts";

/*
 * El manifiesto real de `dreamsenmonticell.bar`, recortado.
 *
 * Se copia tal cual y no se inventa: los tamaños llegan como `"512x512"`, los
 * iconos repetidos con `purpose` distinto, y el nombre con `®` escapado. Un
 * ejemplo escrito a mano habría salido más limpio que la realidad y no habría
 * probado nada.
 */
const MANIFIESTO = {
  name: "Casino Monticello Oficial®",
  short_name: "Monticello",
  description: "🎰 ¡Juega y gana en Monticello Casino, el más confiable de Chile! 🇨🇱",
  theme_color: "#000000",
  icons: [
    { src: "https://x.bar/i_w48h48.webp", type: "image/webp", sizes: "48x48", purpose: "any" },
    { src: "https://x.bar/i_w48h48.png", type: "image/png", sizes: "48x48", purpose: "maskable" },
    { src: "https://x.bar/i_w512h512.webp", type: "image/webp", sizes: "512x512", purpose: "any" },
    { src: "https://x.bar/i_w192h192.png", type: "image/png", sizes: "192x192", purpose: "any" },
  ],
};

test("saca el nombre, la descripción y el color", () => {
  const app = readAppManifest(MANIFIESTO);

  assert.equal(app.name, "Casino Monticello Oficial®");
  assert.match(app.description, /Monticello Casino/);
  assert.equal(app.themeColor, "#000000");
});

test("elige el icono más grande, que es el único que sirve de referencia", () => {
  // Un icono de 48 píxeles metido en una creatividad sale como una mancha. La
  // lista viene desordenada a propósito en el ejemplo: es como llega de verdad.
  assert.equal(readAppManifest(MANIFIESTO).iconUrl, "https://x.bar/i_w512h512.webp");
});

test("un manifiesto sin iconos no revienta, devuelve vacío", () => {
  assert.equal(readAppManifest({ name: "Algo" }).iconUrl, "");
});

test("un tamaño ilegible no tumba la elección de los demás", () => {
  // `sizes` puede venir como "any" en un SVG, y `parseInt("any")` es NaN: sin
  // cuidado, NaN gana la comparación y el icono elegido es el inservible.
  const app = readAppManifest({
    icons: [
      { src: "https://x.bar/raro.svg", sizes: "any" },
      { src: "https://x.bar/bueno.png", sizes: "256x256" },
    ],
  });

  assert.equal(app.iconUrl, "https://x.bar/bueno.png");
});

test("el nombre corto sirve cuando no hay largo", () => {
  assert.equal(readAppManifest({ short_name: "Monticello" }).name, "Monticello");
});

test("la dirección del manifiesto se resuelve contra la de la página", () => {
  // Viene relativa —`/manifest.json`— y pedirla tal cual no llega a ningún sitio.
  assert.equal(
    manifestUrlFrom('<link rel="manifest" href="/manifest.json"/>', "https://dreamsenmonticell.bar/"),
    "https://dreamsenmonticell.bar/manifest.json",
  );
});

test("sin manifiesto declarado se prueba la ruta de siempre", () => {
  // Casi todas las PWA lo sirven ahí aunque no lo declaren en el HTML.
  assert.equal(
    manifestUrlFrom("<html><head></head></html>", "https://x.bar/"),
    "https://x.bar/manifest.json",
  );
});

test("las pantallas de la página se sacan absolutas y sin el icono", () => {
  /*
   * De `dreamsenmonticell.bar`: la página trae las pantallas promocionales de la
   * app —el bono, los métodos de pago— y también el icono repetido en cinco
   * tamaños. El icono no es una pantalla, y colarlo de referencia haría que la
   * creatividad enseñara un logo en vez de la app.
   */
  const html = `
    <img src="/npi1-pwa-images/0b/dd/52/pantalla.png">
    <img src="/npi1-pwa-images/71/99/ad/icono_w192h192.png">
    <img src="/npi1-pwa-images/71/99/ad/icono_w48h48.png">
    <img src="https://otro.cdn/pantalla2.png">
  `;

  assert.deepEqual(imagesFrom(html, "https://dreamsenmonticell.bar/"), [
    "https://dreamsenmonticell.bar/npi1-pwa-images/0b/dd/52/pantalla.png",
    "https://otro.cdn/pantalla2.png",
  ]);
});

test("la misma imagen dos veces se devuelve una", () => {
  const html = `<img src="/a.png"><img src="/a.png">`;

  assert.equal(imagesFrom(html, "https://x.bar/").length, 1);
});
