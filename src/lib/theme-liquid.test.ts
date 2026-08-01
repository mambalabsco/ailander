import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SECTION_BYTES,
  blockSettingsOf,
  coerceSettings,
  reviewSection,
  sectionFilename,
  sectionType,
} from "./theme-liquid.ts";

/** Una sección correcta, para partir de algo que pasa. */
function seccion(over: { markup?: string; schema?: unknown } = {}): string {
  const schema = over.schema ?? {
    name: "Héroe",
    settings: [{ type: "text", id: "heading", label: "Título" }],
    blocks: [{ type: "item", name: "Elemento", settings: [{ type: "text", id: "title" }] }],
    presets: [{ name: "Héroe" }],
  };

  return `<style>
  #shopify-section-{{ section.id }} .lp { padding: 40px }
</style>
${over.markup ?? "<div class=\"lp\">{{ section.settings.heading }}</div>"}
{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}`;
}

test("una sección correcta pasa sin problemas", () => {
  const review = reviewSection(seccion());

  assert.deepEqual(review.problems, []);
  assert.equal(review.ok, true);
  assert.equal(review.schema?.name, "Héroe");
});

/* --------------------------------- El esquema ------------------------------ */

test("un esquema con una coma de más se caza aquí, porque Shopify no avisa", () => {
  const source = `<div>x</div>\n{% schema %}\n{ "name": "X", }\n{% endschema %}`;
  const review = reviewSection(source);

  assert.equal(review.ok, false);
  assert.match(review.problems.join(" "), /no es JSON válido/);
  // El mensaje tiene que decir por qué no se vería el fallo de otra forma.
  assert.match(review.problems.join(" "), /no aparecería en el editor/);
});

test("sin esquema no hay sección", () => {
  assert.match(reviewSection("<div>hola</div>").problems.join(" "), /no tiene bloque/i);
});

test("sin presets no se puede añadir desde el editor", () => {
  const review = reviewSection(seccion({ schema: { name: "X", settings: [], presets: [] } }));

  assert.match(review.problems.join(" "), /presets/);
});

/* -------------------------------- Las etiquetas ---------------------------- */

test("un for sin cerrar rompería la plantilla entera", () => {
  const review = reviewSection(
    seccion({ markup: '<div class="lp">{% for block in section.blocks %}<p>x</p></div>' }),
  );

  assert.match(review.problems.join(" "), /\{% for %\}/);
});

test("un if bien cerrado con else no da falso positivo", () => {
  // Con una pila ingenua, `{% else %}` haría saltar la comprobación.
  const markup = `<div class="lp">
    {% if section.settings.heading != blank %}<h2>{{ section.settings.heading }}</h2>
    {% else %}<h2>Sin título</h2>{% endif %}
  </div>`;

  assert.deepEqual(reviewSection(seccion({ markup })).problems, []);
});

/* ------------------------------- Los ajustes ------------------------------- */

test("un ajuste que se usa y no se declara saldría vacío", () => {
  // El fallo peor: la sección aparece, se coloca, y no tiene texto. Nada falla.
  const review = reviewSection(
    seccion({ markup: '<div class="lp">{{ section.settings.subtitulo }}</div>' }),
  );

  assert.match(review.problems.join(" "), /section\.settings\.subtitulo/);
  assert.match(review.problems.join(" "), /saldría vacío/);
});

test("y lo mismo con los de bloque", () => {
  const markup = `<div class="lp">{% for block in section.blocks %}{{ block.settings.precio }}{% endfor %}</div>`;
  const review = reviewSection(seccion({ markup }));

  assert.match(review.problems.join(" "), /block\.settings\.precio/);
});

test("un ajuste declarado en el bloque no se confunde con uno de sección", () => {
  const markup = `<div class="lp">{% for block in section.blocks %}{{ block.settings.title }}{% endfor %}</div>`;

  assert.deepEqual(reviewSection(seccion({ markup })).problems, []);
});

/* ---------------------------------- El CSS --------------------------------- */

test("un selector sin encerrar pintaría fuera de la sección", () => {
  const source = `<style>
  h2 { color: red }
</style>
<div class="lp">{{ section.settings.heading }}</div>
{% schema %}
{"name":"X","settings":[{"type":"text","id":"heading"}],"presets":[{"name":"X"}]}
{% endschema %}`;

  assert.match(reviewSection(source).problems.join(" "), /no está encerrado/);
});

test("un @media con dentro un selector encerrado pasa", () => {
  const source = `<style>
  @media (min-width: 750px) {
    #shopify-section-{{ section.id }} .lp { padding: 80px }
  }
</style>
<div class="lp">{{ section.settings.heading }}</div>
{% schema %}
{"name":"X","settings":[{"type":"text","id":"heading"}],"presets":[{"name":"X"}]}
{% endschema %}`;

  assert.deepEqual(reviewSection(source).problems, []);
});

/* ------------------------------ Lo que no vale ----------------------------- */

test("no puede depender de fragmentos del tema", () => {
  // No sabemos qué fragmentos trae ese tema.
  const review = reviewSection(seccion({ markup: '<div class="lp">{% render "icon" %}</div>' }));

  assert.match(review.problems.join(" "), /fragmento del tema/);
});

test("ni traer scripts ni cargar cosas de fuera", () => {
  assert.match(
    reviewSection(seccion({ markup: "<script>alert(1)</script>" })).problems.join(" "),
    /script/i,
  );
  assert.match(
    reviewSection(seccion({ markup: '<img src="https://otra-tienda.com/foto.jpg">' })).problems.join(
      " ",
    ),
    /fuera de la tienda/,
  );
});

test("un SVG en línea no cuenta como cargar algo de fuera", () => {
  // Es el espacio de nombres, no una descarga — y todo icono lo lleva.
  const markup = `<div class="lp"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24"/></svg></div>`;

  assert.deepEqual(reviewSection(seccion({ markup })).problems, []);
});

test("un archivo enorme no se escribe", () => {
  const review = reviewSection(seccion({ markup: "x".repeat(MAX_SECTION_BYTES + 1) }));

  assert.match(review.problems.join(" "), /tope/);
});

test("vacío no revienta", () => {
  assert.equal(reviewSection("   ").ok, false);
});

/* ------------------------------- Los nombres ------------------------------- */

test("el nombre del archivo lleva el papel y no pisa el tema", () => {
  assert.equal(sectionType("comparativa", 0), "lp-comparativa-1");
  assert.equal(sectionFilename("lp-comparativa-1"), "sections/lp-comparativa-1.liquid");
});

test("los acentos y los espacios no llegan al nombre del archivo", () => {
  assert.equal(sectionType("prueba-social", 1), "lp-prueba-social-2");
  assert.equal(sectionType("garantía", 0), "lp-garantia-1");
});

/* --------------------------- Los valores de los ajustes -------------------- */

test("una casilla que llega como texto se guarda como booleano", () => {
  // Si se guardara como texto, Shopify la leería como verdadera SIEMPRE: en
  // Liquid cualquier cadena no vacía es verdadera, incluida "false".
  const settings = coerceSettings(
    [{ id: "destacado", value: "false" }],
    [{ id: "destacado", type: "checkbox" }],
  );

  assert.equal(settings.destacado, false);
});

test("un rango se guarda como número", () => {
  const settings = coerceSettings([{ id: "padding", value: "56" }], [{ id: "padding", type: "range" }]);

  assert.equal(settings.padding, 56);
});

test("un número ilegible se deja fuera para que mande el del esquema", () => {
  const settings = coerceSettings([{ id: "padding", value: "mucho" }], [{ id: "padding", type: "range" }]);

  assert.equal("padding" in settings, false, "escribir NaN dejaría la sección sin renderizar");
});

test("un ajuste que el esquema no declara no se escribe", () => {
  const settings = coerceSettings([{ id: "inventado", value: "x" }], [{ id: "heading", type: "text" }]);

  assert.deepEqual(settings, {});
});

test("los ajustes de un tipo de bloque salen del esquema", () => {
  const schema = { blocks: [{ type: "item", settings: [{ id: "title", type: "text" }] }] };

  assert.deepEqual(blockSettingsOf(schema, "item"), [{ id: "title", type: "text" }]);
  assert.deepEqual(blockSettingsOf(schema, "otro"), []);
});
