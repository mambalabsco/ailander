import assert from "node:assert/strict";
import { test } from "node:test";

import { HELP, normalize, searchHelp } from "./help.ts";

test("se busca sin tildes y en minúsculas", () => {
  // Nadie escribe «investigación» con tilde al buscar, ni «Vídeos» con mayúscula.
  assert.equal(normalize("Investigación"), "investigacion");
  assert.ok(searchHelp("investigacion").some((one) => one.id === "investigacion"));
  assert.ok(searchHelp("VÍDEOS").some((one) => one.id === "videos"));
});

test("se busca con las palabras del problema, no con las del menú", () => {
  /*
   * Nadie llega preguntando «¿dónde está la sección de vídeos?». Llega con
   * «mi video sale sin voz». Sin las etiquetas, el buscador solo encuentra a
   * quien ya sabe cómo se llama lo que busca — que es quien no lo necesita.
   */
  assert.equal(searchHelp("mi video sale sin voz")[0]?.id, "videos");
  assert.equal(searchHelp("que permisos pide shopify")[0]?.id, "tiendas");
  assert.equal(searchHelp("la copia sale vacia")[0]?.id, "copiador");
  assert.equal(searchHelp("no se ve el cambio")[0]?.id, "despliegue");
});

test("manda cuántas palabras encajan, no dónde encaja una", () => {
  // Un artículo que cumple varias va antes que otro que cumple una en el
  // título; si no, una palabra suelta del enunciado decidiría el orden.
  const orden = searchHelp("publicar borrador shopify");

  assert.equal(orden[0]?.id, "publicar");
});

test("las palabras que no aparecen no descartan el resultado", () => {
  // «Cómo hago para que…» son palabras de relleno de la pregunta. Exigiéndolas
  // todas no se encontraría nunca nada.
  const found = searchHelp("como hago para copiar una landing");

  assert.ok(found.some((one) => one.id === "copiador"));
});

test("sin búsqueda se ven todos, y una búsqueda sin respuesta no inventa", () => {
  assert.equal(searchHelp("").length, HELP.length);
  assert.equal(searchHelp("   ").length, HELP.length);
  assert.deepEqual(searchHelp("xilofono submarino"), []);
});

test("cada artículo dice dónde vive en la aplicación", () => {
  /*
   * Un manual que explica algo sin decir en qué pantalla está obliga a buscarlo
   * a mano después de haberlo entendido, que es la mitad del trabajo.
   */
  for (const article of HELP) {
    assert.ok(article.where.length > 2, `${article.id} no dice dónde está`);
    assert.ok(article.tags.length >= 3, `${article.id} tiene pocas palabras de búsqueda`);
    assert.ok(article.body.length >= 2, `${article.id} está demasiado corto`);
  }
});
