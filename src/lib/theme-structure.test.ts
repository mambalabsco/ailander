import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_LIMITS,
  parseTemplate,
  planChanges,
  orderFor,
  reorderTemplate,
  roleOf,
  summarize,
} from "./theme-structure.ts";

/* ------------------------------ La plantilla ------------------------------- */

test("el orden sale de `order`, no de las claves del objeto", () => {
  /*
   * El orden de las claves de un objeto no es el orden en que se pintan las
   * secciones. Leerlo de ahí daría una estructura que parece correcta y está
   * desordenada — y todo el plan saldría mal sin que nada avise.
   */
  const json = JSON.stringify({
    sections: {
      faq: { type: "collapsible-content" },
      main: { type: "main-product" },
      reviews: { type: "product-reviews" },
    },
    order: ["main", "reviews", "faq"],
  });

  assert.deepEqual(
    parseTemplate(json).map((section) => section.type),
    ["main-product", "product-reviews", "collapsible-content"],
  );
});

test("sin `order` se usan las claves, que es mejor que nada", () => {
  const json = JSON.stringify({ sections: { a: { type: "main-product" } } });

  assert.equal(parseTemplate(json).length, 1);
});

test("la cabecera de comentario de Shopify no impide leer la plantilla", () => {
  /*
   * Las plantillas JSON de Shopify **no son JSON válido**: empiezan con un
   * comentario que genera el propio Shopify. El síntoma era desconcertante — el
   * archivo existía, pesaba cien kilobytes, y la plataforma decía que el tema no
   * era de bloques.
   */
  const real = `/*
 * ------------------------------------------------------------
 * IMPORTANT: The contents of this file are auto-generated.
 * ------------------------------------------------------------
 */
{
  "sections": { "main": { "type": "main-product" } },
  "order": ["main"]
}`;

  assert.deepEqual(
    parseTemplate(real).map((section) => section.type),
    ["main-product"],
  );
});

test("no se barren comentarios dentro del archivo, que romperían las URL", () => {
  // Las plantillas están llenas de `https://`, y quitar `//` por todas partes
  // partiría cualquier enlace que viva dentro de una cadena.
  const json = JSON.stringify({
    sections: { main: { type: "main-product", settings: { url: "https://ejemplo.com/a" } } },
    order: ["main"],
  });

  assert.equal(parseTemplate(json).length, 1);
});

test("un JSON roto o una plantilla vieja no lanzan, devuelven vacío", () => {
  // Los temas anteriores a Shopify 2.0 usan `.liquid` sin JSON: ahí no hay nada
  // que comparar, pero tampoco un error que enseñar.
  assert.deepEqual(parseTemplate("no es json"), []);
  assert.deepEqual(parseTemplate("{}"), []);
  assert.deepEqual(parseTemplate('{"sections": null}'), []);
});

test("una sección sin tipo se descarta sin tirar el resto", () => {
  const json = JSON.stringify({
    sections: { a: { type: "main-product" }, b: { titulo: "sin tipo" } },
    order: ["a", "b"],
  });

  assert.equal(parseTemplate(json).length, 1);
});

/* -------------------------------- Los papeles ------------------------------ */

test("reconoce el papel aunque el tema le ponga otro nombre", () => {
  /*
   * Da igual que un tema llame `multicolumn` a lo que otro llama `benefits`: lo
   * que se compara es el papel que cumple en la página.
   */
  assert.equal(roleOf("main-product"), "heroe");
  assert.equal(roleOf("featured-product"), "heroe");
  assert.equal(roleOf("multicolumn"), "beneficios");
  assert.equal(roleOf("icon-with-text"), "beneficios");
  assert.equal(roleOf("collapsible-content"), "faq");
  assert.equal(roleOf("product-reviews"), "testimonios");
});

test("los nombres reales del tema Elixir se reconocen", () => {
  /*
   * Estos salen de `templates/product.json` de una tienda de verdad. La primera
   * versión de los patrones estaba escrita a ciegas y dejaba siete de catorce
   * secciones sin papel.
   */
  assert.equal(roleOf("shop-product-details"), "heroe");
  assert.equal(roleOf("product-comparison"), "comparativa");
  assert.equal(roleOf("as-seen-in-logos"), "prueba-social");
  assert.equal(roleOf("statistics-column"), "prueba-social");
  assert.equal(roleOf("store-features"), "beneficios");
  assert.equal(roleOf("product-benefits"), "beneficios");
  assert.equal(roleOf("roadmap"), "mecanismo");
  assert.equal(roleOf("store-faq"), "faq");
  assert.equal(roleOf("sticky-add-to-cart"), "cta");
});

test("la comparativa gana al héroe, porque lleva «product» dentro", () => {
  // Con el patrón del héroe primero, `product-comparison` caería en «heroe» y se
  // perdería justo la sección que más interesa detectar.
  assert.equal(roleOf("product-comparison"), "comparativa");
  assert.equal(roleOf("main-product"), "heroe");
});

test("los genéricos solo se clasifican si nada concreto encajó", () => {
  /*
   * `image-with-text` no dice qué papel cumple: depende de lo que lleve dentro.
   * Ponerlo arriba en la lista se llevaría media página.
   */
  assert.equal(roleOf("image-with-text"), "contenido");
  assert.equal(roleOf("rich-text"), "contenido");
  // Pero uno que sí dice algo concreto no cae ahí.
  assert.equal(roleOf("image-with-text-comparison"), "comparativa");
});

test("lo que no encaja en nada es «otra», que ya es información", () => {
  assert.equal(roleOf("custom-liquid-42"), "otra");
});

/* --------------------------------- El plan --------------------------------- */

test("dice qué falta y en qué posición debería ir", () => {
  const current = parseTemplate(
    JSON.stringify({
      sections: { main: { type: "main-product" }, faq: { type: "collapsible-content" } },
      order: ["main", "faq"],
    }),
  );

  const changes = planChanges(current, [
    { kind: "heroe" },
    { kind: "comparativa" },
    { kind: "faq" },
  ]);

  const add = changes.find((change) => change.kind === "añadir");
  assert.equal(add?.role, "comparativa");
  assert.equal(add?.targetPosition, 2);
});

test("solo propone mover cuando el salto es de más de una posición", () => {
  /*
   * Las dos páginas no tienen el mismo número de secciones. Comparando
   * posiciones absolutas sin margen, casi todo saldría como «movido» y el plan
   * sería ruido.
   */
  const current = parseTemplate(
    JSON.stringify({
      sections: {
        main: { type: "main-product" },
        icons: { type: "icon-with-text" },
        faq: { type: "collapsible-content" },
      },
      order: ["main", "icons", "faq"],
    }),
  );

  // «faq» está en la 3 y se quiere en la 2: un salto, se mantiene.
  const uno = planChanges(current, [{ kind: "heroe" }, { kind: "faq" }]);
  assert.equal(uno.find((change) => change.role === "faq")?.kind, "mantener");

  // Ahora se quiere en la 1: dos saltos, sí se mueve.
  const dos = planChanges(current, [{ kind: "faq" }]);
  assert.equal(dos.find((change) => change.role === "faq")?.kind, "mover");
});

test("lo que sobra se marca con matiz, no como estorbo", () => {
  const current = parseTemplate(
    JSON.stringify({
      sections: { main: { type: "main-product" }, extra: { type: "product-reviews" } },
      order: ["main", "extra"],
    }),
  );

  const remove = planChanges(current, [{ kind: "heroe" }]).find(
    (change) => change.kind === "quitar",
  );

  assert.equal(remove?.role, "testimonios");
  assert.match(remove!.reason, /No es motivo para quitarla/);
});

test("la cabecera y el pie no se cuestionan", () => {
  // Están en toda tienda y no forman parte de la estructura de venta.
  const current = parseTemplate(
    JSON.stringify({
      sections: {
        header: { type: "header" },
        main: { type: "main-product" },
        footer: { type: "footer" },
      },
      order: ["header", "main", "footer"],
    }),
  );

  const removals = planChanges(current, [{ kind: "heroe" }]).filter(
    (change) => change.kind === "quitar",
  );

  assert.deepEqual(removals, []);
});

test("el resumen cuenta cada tipo de cambio", () => {
  const counts = summarize([
    { kind: "añadir", role: "a", reason: "" },
    { kind: "añadir", role: "b", reason: "" },
    { kind: "mantener", role: "c", reason: "" },
  ]);

  assert.equal(counts.añadir, 2);
  assert.equal(counts.mantener, 1);
  assert.equal(counts.mover, 0);
});

/* ------------------------------- Los límites ------------------------------- */

test("está escrito que el plan no trae contenido de la referencia", () => {
  const texto = PLAN_LIMITS.join(" ");

  assert.match(texto, /No copia texto ni imágenes/);
  assert.match(texto, /No importa código de tema/);
  assert.match(texto, /sale de tu producto/);
});

/* ------------------------------- Aplicarlo --------------------------------- */

const CON_CABECERA = `/* auto-generated */
{
  "sections": {
    "a": { "type": "main-product", "settings": { "x": 1 } },
    "b": { "type": "store-faq" },
    "c": { "type": "testimonials" }
  },
  "order": ["a", "b", "c"]
}`;

test("reordenar solo cambia `order`, y conserva los ajustes", () => {
  const out = reorderTemplate(CON_CABECERA, ["a", "c", "b"])!;
  const data = JSON.parse(out.slice(out.indexOf("{")));

  assert.deepEqual(data.order, ["a", "c", "b"]);
  // Los ajustes de cada sección quedan intactos: el reordenado es mecánico y no
  // tiene por qué arriesgar nada de lo que ya funciona.
  assert.deepEqual(data.sections.a.settings, { x: 1 });
  assert.equal(data.sections.b.type, "store-faq");
});

test("se conserva la cabecera de Shopify", () => {
  // Quitarla haría que el diff del tema pareciera un cambio mucho mayor del que
  // es, y quien mire el historial tiene que poder ver qué se tocó.
  assert.ok(reorderTemplate(CON_CABECERA, ["a", "b", "c"])!.startsWith("/* auto-generated */"));
});

test("una sección que no se nombró se conserva al final, no se pierde", () => {
  /*
   * Perder una sección por no haberla nombrado sería un destrozo silencioso: la
   * página aparecería sin ella y nada diría por qué.
   */
  const data = JSON.parse(reorderTemplate(CON_CABECERA, ["c"])!.split("*/")[1]);

  assert.deepEqual(data.order, ["c", "a", "b"]);
});

test("un identificador inventado se ignora", () => {
  const data = JSON.parse(reorderTemplate(CON_CABECERA, ["a", "fantasma", "b"])!.split("*/")[1]);

  assert.deepEqual(data.order, ["a", "b", "c"]);
});

test("una plantilla que no se puede leer devuelve null, no algo a medias", () => {
  assert.equal(reorderTemplate("no es json", ["a"]), null);
  assert.equal(reorderTemplate('{"nada": 1}', ["a"]), null);
});

/* --------------------------- El orden que se escribe ----------------------- */

test("una sección no se repite aunque dos papeles coincidan", () => {
  /*
   * El fallo real: Sculpt tiene **dos** `store-faq`. Resolviendo con un `find`
   * por papel, la misma sección salía dos veces y Shopify rechazaba la escritura
   * entera con «order: can't contain duplicate values», sin decir cuál.
   */
  const current = parseTemplate(
    JSON.stringify({
      sections: {
        main: { type: "shop-product-details" },
        faq1: { type: "store-faq" },
        faq2: { type: "store-faq" },
      },
      order: ["main", "faq1", "faq2"],
    }),
  );

  const order = orderFor(current, [{ kind: "faq" }, { kind: "faq" }, { kind: "heroe" }]);

  assert.deepEqual(order, ["faq1", "faq2", "main"]);
  assert.equal(new Set(order).size, order.length, "no puede haber repetidos");
});

test("lo que el plano no pide se conserva al final", () => {
  // Reordenar no es quitar: perder una sección por no estar en la referencia
  // sería un destrozo silencioso.
  const current = parseTemplate(
    JSON.stringify({
      sections: { a: { type: "shop-product-details" }, b: { type: "rich-text" } },
      order: ["a", "b"],
    }),
  );

  assert.deepEqual(orderFor(current, [{ kind: "heroe" }]), ["a", "b"]);
});

test("reorderTemplate quita los repetidos aunque se los manden", () => {
  // La invariante es suya: un orden es una permutación.
  const out = reorderTemplate(CON_CABECERA, ["a", "a", "b", "b"])!;
  const order = JSON.parse(out.split("*/")[1]).order;

  assert.deepEqual(order, ["a", "b", "c"]);
  assert.equal(new Set(order).size, order.length);
});
