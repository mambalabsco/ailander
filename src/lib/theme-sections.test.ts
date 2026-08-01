import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREATABLE,
  buildTemplateEntry,
  canCreate,
  clearDemoImages,
  orderAfterRecreate,
  planRecreate,
  writeTemplate,
} from "./theme-sections.ts";
import type { TemplateSection } from "./theme-structure.ts";

/* --------------------------- Qué se crea y qué no -------------------------- */

test("lo que es del tema no se crea", () => {
  // Escribir una cabecera propia dejaría dos menús en la página.
  for (const kind of ["cabecera", "pie", "anuncio", "catalogo"]) {
    assert.equal(canCreate(kind), false, `${kind} no debería crearse`);
  }

  assert.ok(CREATABLE.includes("comparativa"));
});

/* ---------------------------- La entrada en la plantilla ------------------- */

test("una sección con bloques sale con su orden", () => {
  const entrada = buildTemplateEntry({
    kind: "faq",
    type: "lp-faq-1",
    index: 0,
    settings: { heading: "Preguntas" },
    blocks: [
      { type: "item", settings: { title: "¿Cuánto tarda?", body: "Entre 2 y 4 días." } },
      { type: "item", settings: { title: "¿Y si no me sirve?", body: "Se devuelve." } },
    ],
  });

  assert.equal(entrada.id, "lp-faq-1");
  assert.equal(entrada.entry.type, "lp-faq-1");
  assert.deepEqual(entrada.entry.block_order, ["b1", "b2"]);
});

test("una sin bloques no declara block_order vacío", () => {
  // Shopify acepta el array vacío, pero deja ruido en la plantilla que hace
  // dudar de si la sección debería tener bloques.
  const entrada = buildTemplateEntry({
    kind: "mecanismo",
    type: "lp-mecanismo-1",
    index: 0,
    settings: { heading: "Cómo funciona" },
    blocks: [],
  });

  assert.equal("blocks" in entrada.entry, false);
  assert.equal("block_order" in entrada.entry, false);
});

/* ------------------------------ La plantilla ------------------------------- */

const PLANTILLA = `/* comentario autogenerado */
${JSON.stringify({ sections: { main: { type: "main-product" } }, order: ["main"] }, null, 2)}`;

function seccionCreada(type: string) {
  return buildTemplateEntry({ kind: "faq", type, index: 0, settings: {}, blocks: [] });
}

test("las secciones nuevas se añaden y el formulario de compra se queda", () => {
  const salida = writeTemplate(PLANTILLA, [seccionCreada("lp-faq-1")], ["main", "lp-faq-1"]);
  const data = JSON.parse(salida!);

  assert.deepEqual(data.order, ["main", "lp-faq-1"]);
  assert.equal(data.sections.main.type, "main-product", "perder esto deja una página que no vende");
  assert.equal(data.sections["lp-faq-1"].type, "lp-faq-1");
});

test("una sección que se quedó fuera del orden se conserva al final", () => {
  assert.deepEqual(JSON.parse(writeTemplate(PLANTILLA, [], ["no-existe"])!).order, ["main"]);
});

test("un identificador repetido no se escribe dos veces", () => {
  // Shopify rechaza la escritura entera y no dice cuál está repetido.
  assert.deepEqual(JSON.parse(writeTemplate(PLANTILLA, [], ["main", "main"])!).order, ["main"]);
});

test("una plantilla ilegible no se escribe a medias", () => {
  assert.equal(writeTemplate("{ rota", [], []), null);
  assert.equal(writeTemplate(JSON.stringify({ order: [] }), [], []), null);
});

/* ---------------------------- El plan de recreado -------------------------- */

const MIA: TemplateSection[] = [
  { id: "header", type: "header", position: 0 },
  { id: "main", type: "main-product", position: 1 },
  { id: "faq-vieja", type: "store-faq", position: 2 },
  { id: "envios", type: "shipping-info", position: 3 },
  { id: "footer", type: "footer", position: 4 },
];

function pide(...kinds: string[]) {
  return kinds.map((kind) => ({ kind, purpose: "", angle: "" }));
}

test("la sección principal nunca se retira: sin ella no se puede comprar", () => {
  // Se pide un plano que la sustituiría si no estuviera protegida.
  const plan = planRecreate(MIA, pide("heroe", "oferta", "faq"));

  assert.ok(plan.keep.some((section) => section.id === "main"));
  assert.ok(!plan.retire.some((section) => section.id === "main"));
});

test("una sección propia que el plano duplica se retira", () => {
  const plan = planRecreate(MIA, pide("faq"));

  assert.deepEqual(
    plan.retire.map((section) => section.id),
    ["faq-vieja"],
  );
});

test("y si el plano no pide nada en su lugar, se queda", () => {
  const plan = planRecreate(MIA, pide("heroe"));

  assert.ok(plan.keep.some((section) => section.id === "faq-vieja"));
  assert.deepEqual(plan.retire, []);
});

test("la cabecera y el pie no se tocan aunque el plano los traiga", () => {
  const plan = planRecreate(MIA, pide("cabecera", "pie"));

  assert.ok(plan.keep.some((section) => section.id === "header"));
  assert.ok(plan.keep.some((section) => section.id === "footer"));
  assert.deepEqual(plan.create, [], "no se crean: dejaría dos menús");
});

test("el formulario de compra va detrás del héroe, no el primero", () => {
  const plan = planRecreate(MIA, pide("heroe", "faq"));
  const creadas = plan.create.map((section, index) =>
    buildTemplateEntry({
      kind: section.kind,
      type: `lp-${section.kind}-${index + 1}`,
      index,
      settings: {},
      blocks: [],
    }),
  );

  const orden = orderAfterRecreate(plan, creadas, MIA);

  assert.deepEqual(orden, ["header", "lp-heroe-1", "main", "lp-faq-2", "envios", "footer"]);
});

test("sin nada creado el orden sigue siendo válido", () => {
  const plan = planRecreate(MIA, []);
  const orden = orderAfterRecreate(plan, [], MIA);

  assert.equal(orden[0], "header");
  assert.equal(orden.at(-1), "footer");
  assert.equal(new Set(orden).size, orden.length, "no puede haber repetidos");
});

/* --------------------- Quitar las imágenes de maqueta ---------------------- */

const CON_MAQUETA = JSON.stringify({
  sections: {
    "lp-heroe-1": {
      type: "lp-heroe-1",
      settings: { heading: "Hola", foto_url: "https://otra/1.jpg", cta_url: "/products/x" },
      blocks: { b1: { type: "item", settings: { img_url: "https://otra/2.jpg" } } },
    },
    "store-faq": { type: "store-faq", settings: { foto_url: "https://mia/3.jpg" } },
  },
  order: ["lp-heroe-1", "store-faq"],
});

test("se vacían las de las secciones creadas, también las de los bloques", () => {
  const { cleared, json } = clearDemoImages(CON_MAQUETA);
  const data = JSON.parse(json!);

  assert.equal(cleared, 3);
  assert.equal(data.sections["lp-heroe-1"].settings.foto_url, "");
  assert.equal(data.sections["lp-heroe-1"].blocks.b1.settings.img_url, "");
});

test("una sección del tema no se toca", () => {
  // Quitar lo prestado no puede deshacer lo que alguien puso a mano.
  const data = JSON.parse(clearDemoImages(CON_MAQUETA).json!);

  assert.equal(data.sections["store-faq"].settings.foto_url, "https://mia/3.jpg");
});

test("los enlaces no son imágenes", () => {
  // `cta_url` acaba en _url y es el destino del botón: vaciarlo dejaría el
  // botón sin ir a ninguna parte.
  const data = JSON.parse(clearDemoImages(CON_MAQUETA).json!);

  assert.equal(data.sections["lp-heroe-1"].settings.cta_url, "");
});

test("sin nada que quitar no se reescribe la plantilla", () => {
  const limpia = JSON.stringify({ sections: { "lp-x-1": { type: "lp-x-1", settings: {} } }, order: [] });
  const { cleared, json } = clearDemoImages(limpia);

  assert.equal(cleared, 0);
  assert.equal(json, limpia, "reescribir sin cambios solo añade ruido al historial del tema");
});

test("una plantilla ilegible no se toca", () => {
  assert.deepEqual(clearDemoImages("{ rota"), { cleared: 0, json: null });
});
