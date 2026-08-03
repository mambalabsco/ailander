import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREATABLE,
  SECTION_LIMIT,
  buildTemplateEntry,
  capSections,
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
  const data = JSON.parse(salida!.json);

  assert.deepEqual(data.order, ["main", "lp-faq-1"]);
  assert.equal(data.sections.main.type, "main-product", "perder esto deja una página que no vende");
  assert.equal(data.sections["lp-faq-1"].type, "lp-faq-1");
});

test("una sección que se quedó fuera del orden se conserva al final", () => {
  assert.deepEqual(JSON.parse(writeTemplate(PLANTILLA, [], ["no-existe"])!.json).order, ["main"]);
});

test("un identificador repetido no se escribe dos veces", () => {
  // Shopify rechaza la escritura entera y no dice cuál está repetido.
  assert.deepEqual(JSON.parse(writeTemplate(PLANTILLA, [], ["main", "main"])!.json).order, ["main"]);
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

/* --------------------------- El tope de Shopify ---------------------------- */

/*
 * Una plantilla JSON no admite más de veinticinco secciones. Pasarse rechaza
 * **la escritura entera** con «sections: must have a maximum of 25» y sin decir
 * cuáles sobran, así que se perdería el trabajo de todas —ya pagado— por culpa
 * de la vigesimosexta.
 */
const tipos = (n: number, prefijo = "lp-x") =>
  Array.from({ length: n }, (_, i) => `${prefijo}-${i + 1}`);

const tipoDe = (id: string) => id;

test("por debajo del tope no se toca nada", () => {
  const order = tipos(25);
  const result = capSections(order, tipoDe);

  assert.deepEqual(result.order, order);
  assert.deepEqual(result.dropped, []);
});

test("por encima del tope se corta por el final", () => {
  // Una página se lee de arriba abajo: lo de abajo es lo que menos gente ve.
  const result = capSections(tipos(31), tipoDe);

  assert.equal(result.order.length, SECTION_LIMIT);
  assert.equal(result.dropped.length, 6);
  assert.deepEqual(
    result.dropped.map((item) => item.id),
    ["lp-x-26", "lp-x-27", "lp-x-28", "lp-x-29", "lp-x-30", "lp-x-31"],
  );
});

test("el formulario de compra se salva aunque esté al final", () => {
  // Perderlo deja una página preciosa donde no se puede comprar, y eso no se
  // nota mirando: se nota en las ventas del día siguiente.
  const order = [...tipos(30), "main-product"];
  const result = capSections(order, tipoDe);

  assert.ok(result.order.includes("main-product"));
  assert.equal(result.order.length, SECTION_LIMIT);
  assert.equal(result.dropped.some((item) => item.id === "main-product"), false);
});

test("la cabecera y el pie tampoco caen", () => {
  const order = ["header", ...tipos(30), "footer"];
  const result = capSections(order, tipoDe);

  assert.ok(result.order.includes("header"));
  assert.ok(result.order.includes("footer"));
});

test("si lo imprescindible ya no cabe, no se recorta más de la cuenta", () => {
  // Preferimos que Shopify rechace a entregar una tienda sin formulario de
  // compra: lo primero se ve y se arregla, lo segundo no lo nota nadie.
  const order = Array.from({ length: 30 }, (_, i) => `main-${i}`);
  const result = capSections(order, tipoDe);

  assert.equal(result.order.length, 30);
  assert.deepEqual(result.dropped, []);
});

test("lo que no cabe se quita también de `sections`, no solo del orden", () => {
  // Dejarlas ahí sin estar en `order` cuenta igual para el límite y Shopify
  // rechaza exactamente lo mismo.
  const muchas = tipos(30).map((tipo) =>
    buildTemplateEntry({ kind: "faq", type: tipo, index: 0, settings: {}, blocks: [] }),
  );

  const salida = writeTemplate(PLANTILLA, muchas, ["main", ...muchas.map((m) => m.id)]);
  const data = JSON.parse(salida!.json);

  assert.equal(data.order.length, SECTION_LIMIT);
  assert.equal(Object.keys(data.sections).length, SECTION_LIMIT);
  assert.equal(salida!.dropped.length, 6);

  // Y el formulario de compra sigue ahí.
  assert.equal(data.sections.main.type, "main-product");
});

/*
 * Cortar al escribir llega tarde: cada sección generada cuesta, y seis que se
 * tiran son seis pagadas para nada. Por eso el plan ya las aparta.
 */
test("el plan no pide más secciones de las que caben", () => {
  const mias = Array.from({ length: 20 }, (_, i) => ({
    id: `mia-${i}`,
    type: `custom-${i}`,
    position: i,
  }));

  const plano = Array.from({ length: 15 }, () => ({
    kind: "faq",
    purpose: "x",
    angle: "y",
  }));

  const plan = planRecreate(mias, plano);

  assert.equal(plan.keep.length + plan.create.length <= SECTION_LIMIT, true);
  assert.equal(plan.overflow.length > 0, true);
  assert.equal(plan.create.length + plan.overflow.length, 15);
});

test("con sitio de sobra no se aparta ninguna", () => {
  const plan = planRecreate(
    [{ id: "main", type: "main-product", position: 0 }],
    [{ kind: "faq", purpose: "x", angle: "y" }],
  );

  assert.deepEqual(plan.overflow, []);
  assert.equal(plan.create.length, 1);
});

test("una plantilla ya llena no deja crear nada, y se sabe por qué", () => {
  const llena = Array.from({ length: 26 }, (_, i) => ({
    id: `mia-${i}`,
    type: `custom-${i}`,
    position: i,
  }));

  const plan = planRecreate(llena, [{ kind: "faq", purpose: "x", angle: "y" }]);

  assert.equal(plan.create.length, 0);
  // La distinción importa: «no hay sitio» se arregla quitando secciones, y
  // «no hay secciones creables» se arregla volviendo a analizar.
  assert.equal(plan.overflow.length, 1);
});
