import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_LIMITS,
  parseTemplate,
  planChanges,
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

test("lo que no encaja es «otra», que ya es información", () => {
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
