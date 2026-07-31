import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LAYOUTS,
  LAYOUT_FOR,
  buildLayoutFile,
  buildTemplateEntry,
  canCreate,
  filesFor,
  layoutFilename,
  wrapRichText,
  orderAfterRecreate,
  planRecreate,
  writeTemplate,
  type SectionContent,
} from "./theme-sections.ts";
import type { TemplateSection } from "./theme-structure.ts";

const PALETA = { background: "#fffaf5", text: "#1a1a1a", accent: "#c0202a" };

function contenido(over: Partial<SectionContent> = {}): SectionContent {
  return {
    kind: "faq",
    heading: "Preguntas",
    subheading: "",
    body: "",
    items: [{ title: "¿Cuánto tarda?", body: "Entre 2 y 4 días." }],
    ...over,
  };
}

/* --------------------------- El archivo de la sección ---------------------- */

test("el esquema de cada disposición es JSON válido", () => {
  // Shopify rechaza el archivo entero si no lo es, y la sección desaparece del
  // editor sin decir por qué.
  for (const layout of LAYOUTS) {
    const file = buildLayoutFile(layout);
    const schema = /{% schema %}([\s\S]*?){% endschema %}/.exec(file);

    assert.ok(schema, `${layout}: no tiene bloque de esquema`);
    assert.doesNotThrow(() => JSON.parse(schema[1]), `${layout}: el esquema no es JSON`);
  }
});

test("el esquema declara sus ajustes y sus presets", () => {
  const schema = JSON.parse(
    /{% schema %}([\s\S]*?){% endschema %}/.exec(buildLayoutFile("acordeon"))![1],
  );

  assert.equal(schema.name, "Preguntas");
  assert.ok(schema.settings.some((setting: { id: string }) => setting.id === "heading"));
  assert.ok(schema.blocks[0].settings.some((setting: { id: string }) => setting.id === "title"));
  assert.ok(schema.presets.length > 0, "sin preset no se puede añadir desde el editor");
});

test("el estilo va encerrado en el identificador de la sección", () => {
  // Sin encerrarlo, dos secciones de la misma disposición en la misma página se
  // pisarían los colores.
  const file = buildLayoutFile("iconos");

  assert.ok(file.includes("#shopify-section-{{ section.id }}"));
  assert.ok(!/^\s*\.lp\s*{/m.test(file), "hay CSS sin encerrar");
});

test("los archivos no se repiten aunque varias secciones compartan disposición", () => {
  // Beneficios, prueba social y garantía son las tres una rejilla.
  const files = filesFor(["beneficios", "prueba-social", "garantia"]);

  assert.equal(files.length, 1);
  assert.equal(files[0].filename, layoutFilename("iconos"));
});

test("lo que es del tema no se crea", () => {
  // Escribir una cabecera propia dejaría dos menús en la página.
  for (const kind of ["cabecera", "pie", "anuncio", "catalogo"]) {
    assert.equal(canCreate(kind), false, `${kind} no debería crearse`);
  }

  assert.deepEqual(filesFor(["cabecera", "pie"]), []);
});

/* ---------------------------- La entrada en la plantilla ------------------- */

test("la de preguntas sale con sus bloques y su orden", () => {
  const entrada = buildTemplateEntry(contenido(), PALETA, 0)!;

  assert.equal(entrada.id, "lp-faq-1");
  assert.equal(entrada.entry.type, "lp-acordeon");
  assert.deepEqual(entrada.entry.block_order, ["b1"]);
  assert.equal(
    (entrada.entry.blocks as Record<string, { settings: { title: string } }>).b1.settings.title,
    "¿Cuánto tarda?",
  );
});

test("la paleta leída viaja a los ajustes de la sección", () => {
  const entrada = buildTemplateEntry(contenido(), PALETA, 0)!;
  const settings = entrada.entry.settings as Record<string, unknown>;

  assert.equal(settings.bg, "#fffaf5");
  assert.equal(settings.accent, "#c0202a");
});

test("la comparativa lleva la tercera columna y sus cabeceras", () => {
  const entrada = buildTemplateEntry(
    contenido({
      kind: "comparativa",
      columns: { mine: "Naturox", theirs: "Otros" },
      items: [{ title: "Dosis", body: "600 mg", other: "200 mg" }],
    }),
    PALETA,
    0,
  )!;

  const settings = entrada.entry.settings as Record<string, unknown>;
  assert.equal(settings.col_mine, "Naturox");

  const blocks = entrada.entry.blocks as Record<string, { settings: Record<string, unknown> }>;
  assert.equal(blocks.b1.settings.other, "200 mg");
});

test("la oferta conserva el tachado y cuál se empuja", () => {
  const entrada = buildTemplateEntry(
    contenido({
      kind: "oferta",
      items: [
        { title: "3 botes", body: "", price: "59.900", compareAt: "89.900", highlighted: true },
      ],
    }),
    PALETA,
    0,
  )!;

  const blocks = entrada.entry.blocks as Record<string, { settings: Record<string, unknown> }>;
  assert.equal(blocks.b1.settings.compare_at, "89.900");
  assert.equal(blocks.b1.settings.highlighted, true);
});

test("un papel que no se puede crear devuelve nada", () => {
  assert.equal(buildTemplateEntry(contenido({ kind: "cabecera" }), PALETA, 0), null);
});

test("el texto suelto se envuelve en párrafos, que es lo que admite Shopify", () => {
  assert.equal(wrapRichText("Uno.\n\nDos."), "<p>Uno.</p><p>Dos.</p>");
  assert.equal(wrapRichText("<p>Ya viene.</p>"), "<p>Ya viene.</p>");
  assert.equal(wrapRichText("   "), "");
});

test("no se pasa de los bloques que admite el esquema", () => {
  const muchos = Array.from({ length: 40 }, (_, i) => ({ title: `P${i}`, body: "R" }));
  const entrada = buildTemplateEntry(contenido({ items: muchos }), PALETA, 0)!;

  assert.equal((entrada.entry.block_order as string[]).length, 24);
});

/* ------------------------------ La plantilla ------------------------------- */

const PLANTILLA = `/* comentario autogenerado */
${JSON.stringify(
  {
    sections: { main: { type: "main-product" } },
    order: ["main"],
  },
  null,
  2,
)}`;

test("las secciones nuevas se añaden y el formulario de compra se queda", () => {
  const faq = buildTemplateEntry(contenido(), PALETA, 0)!;

  const salida = writeTemplate(PLANTILLA, [faq], ["main", "lp-faq-1"]);
  const data = JSON.parse(salida!);

  assert.deepEqual(data.order, ["main", "lp-faq-1"]);
  assert.equal(data.sections.main.type, "main-product", "perder esto deja una página que no vende");
  assert.equal(data.sections["lp-faq-1"].type, "lp-acordeon");
});

test("una sección que se quedó fuera del orden se conserva al final", () => {
  const salida = writeTemplate(PLANTILLA, [], ["no-existe"]);

  assert.deepEqual(JSON.parse(salida!).order, ["main"]);
});

test("un identificador repetido no se escribe dos veces", () => {
  // Shopify rechaza la escritura entera y no dice cuál está repetido.
  const salida = writeTemplate(PLANTILLA, [], ["main", "main"]);

  assert.deepEqual(JSON.parse(salida!).order, ["main"]);
});

test("una plantilla ilegible no se escribe a medias", () => {
  assert.equal(writeTemplate("{ rota", [], []), null);
  assert.equal(writeTemplate(JSON.stringify({ order: [] }), [], []), null);
});

/* -------------------------------- El mapa ---------------------------------- */

test("cada papel que se puede crear tiene disposición y archivo", () => {
  for (const kind of Object.keys(LAYOUT_FOR)) {
    const layout = LAYOUT_FOR[kind];
    assert.ok(LAYOUTS.includes(layout), `${kind} apunta a una disposición que no existe`);
    assert.ok(buildLayoutFile(layout).includes("{% schema %}"));
  }
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
  const creadas = plan.create.map(
    (section, index) => buildTemplateEntry(contenido({ kind: section.kind }), PALETA, index)!,
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
