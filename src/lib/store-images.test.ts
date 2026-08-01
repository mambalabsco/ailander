import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_LIMIT, extractImages, imageKey, widestFromSrcset } from "./store-images.ts";

const ORIGIN = "https://sculptique.com";

test("una imagen normal sale con su texto alternativo", () => {
  const html = `<img src="/cdn/hero.jpg" alt="Mujer tomando la cápsula" width="1200">`;
  const [image] = extractImages(html, ORIGIN);

  assert.equal(image.url, "https://sculptique.com/cdn/hero.jpg");
  assert.equal(image.alt, "Mujer tomando la cápsula");
  assert.equal(image.width, 1200);
});

test("del srcset se coge la más ancha, no la primera", () => {
  // La primera es la de móvil: en un héroe a pantalla completa se ve borrosa, y
  // es justo lo que se está intentando juzgar.
  const html = `<img srcset="/a_400x.jpg 400w, /a_1600x.jpg 1600w" src="/a.jpg">`;
  const [image] = extractImages(html, ORIGIN);

  assert.match(image.url, /1600x/);
  assert.equal(image.width, 1600);
});

test("la misma foto en seis tamaños es una sola imagen", () => {
  // Sin esto la maqueta sale repitiendo una foto en todos los huecos.
  const html = `
    <img src="/cdn/bote.jpg?width=400&v=1" width="400">
    <img src="/cdn/bote.jpg?width=1200&v=1" width="1200">
    <img src="/cdn/bote_800x.jpg" width="800">`;

  assert.equal(extractImages(html, ORIGIN).length, 1);
});

test("y se queda la más grande de esas", () => {
  const html = `
    <img src="/cdn/bote.jpg?width=400" width="400">
    <img src="/cdn/bote.jpg?width=1200" width="1200">`;

  assert.equal(extractImages(html, ORIGIN)[0].width, 1200);
});

test("los iconos y los logos no son contenido", () => {
  const html = `
    <img src="/icons/sprite.png" width="1200">
    <img src="/logo-header.png" width="900">
    <img src="/payment/visa.png" width="400">
    <img src="/flecha.svg" width="800">`;

  assert.deepEqual(extractImages(html, ORIGIN), []);
});

test("lo pequeño tampoco, aunque tenga buen nombre", () => {
  const html = `<img src="/cdn/miniatura.jpg" width="80">`;

  assert.deepEqual(extractImages(html, ORIGIN), []);
});

test("una foto sin ancho declarado se deja pasar", () => {
  // Muchas buenas no lo declaran, y el filtro por nombre ya quitó los iconos.
  const html = `<img src="/cdn/testimonio.jpg" alt="Antes y después">`;

  assert.equal(extractImages(html, ORIGIN).length, 1);
});

test("las que se cargan al bajar se leen de data-src", () => {
  // Sin mirarlo, de una tienda moderna no sale casi ninguna imagen.
  const html = `<img data-src="/cdn/abajo.jpg" src="data:image/gif;base64,R0lGOD" width="1000">`;
  const [image] = extractImages(html, ORIGIN);

  assert.equal(image.url, "https://sculptique.com/cdn/abajo.jpg");
});

test("van de la más ancha a la menos", () => {
  // El hueco grande se rellena primero, y ahí una miniatura estirada se ve peor
  // que un hueco vacío.
  const html = `
    <img src="/a.jpg" width="600">
    <img src="/b.jpg" width="1800">
    <img src="/c.jpg" width="1000">`;

  assert.deepEqual(
    extractImages(html, ORIGIN).map((image) => image.width),
    [1800, 1000, 600],
  );
});

test("las direcciones sin protocolo y absolutas se resuelven igual", () => {
  const html = `
    <img src="//cdn.shopify.com/x.jpg" width="900">
    <img src="https://otro.com/y.jpg" width="900">`;

  assert.deepEqual(
    extractImages(html, ORIGIN).map((image) => image.url),
    ["https://cdn.shopify.com/x.jpg", "https://otro.com/y.jpg"],
  );
});

test("no se guardan más de las que caben", () => {
  const html = Array.from(
    { length: 60 },
    (_, i) => `<img src="/cdn/f${i}.jpg" width="${1000 + i}">`,
  ).join("");

  assert.equal(extractImages(html, ORIGIN).length, IMAGE_LIMIT);
});

test("un srcset roto no revienta", () => {
  assert.equal(widestFromSrcset(""), null);
  assert.deepEqual(extractImages(`<img srcset=", ,">`, ORIGIN), []);
});

test("la clave ignora el tamaño pedido y la versión", () => {
  assert.equal(imageKey("https://c/x.jpg?width=800&v=2"), "https://c/x.jpg");
  assert.equal(imageKey("https://c/x_600x800.jpg"), "https://c/x.jpg");
});
