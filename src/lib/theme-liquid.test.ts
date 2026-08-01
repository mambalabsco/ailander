import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SECTION_BYTES,
  blockSettingsOf,
  coerceSettings,
  fillImageUrls,
  imageUrlSlots,
  reviewSection,
  sectionFilename,
  sectionType,
  stripBlankDefaults,
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

/* --------------------------------- Las imágenes ---------------------------- */

const CON_FOTOS = {
  settings: [
    { type: "image_picker", id: "foto" },
    { type: "text", id: "foto_url" },
    { type: "text", id: "heading" },
    // Un texto acabado en _url sin su selector: puede ser cualquier cosa.
    { type: "text", id: "cta_url" },
  ],
};

test("solo se rellena el texto que hace pareja con un selector de imagen", () => {
  assert.deepEqual(imageUrlSlots(CON_FOTOS), ["foto_url"]);
});

test("la foto se deja puesta en el hueco vacío", () => {
  const { settings, used } = fillImageUrls({ heading: "Hola" }, ["foto_url"], ["https://cdn/1.jpg"]);

  assert.equal(settings.foto_url, "https://cdn/1.jpg");
  assert.equal(used, 1);
});

test("no se pisa una dirección que ya venía escrita", () => {
  const { settings, used } = fillImageUrls(
    { foto_url: "https://cdn/elegida.jpg" },
    ["foto_url"],
    ["https://cdn/otra.jpg"],
  );

  assert.equal(settings.foto_url, "https://cdn/elegida.jpg");
  assert.equal(used, 0);
});

test("con más huecos que fotos se repiten en vez de dejar vacíos", () => {
  // Una página con la misma foto dos veces se entiende y se arregla; una con
  // dos huecos vacíos parece rota.
  const { settings } = fillImageUrls({}, ["a_url", "b_url", "c_url"], ["1.jpg", "2.jpg"]);

  assert.deepEqual(settings, { a_url: "1.jpg", b_url: "2.jpg", c_url: "1.jpg" });
});

test("se sigue por donde se quedó la sección anterior", () => {
  const { settings } = fillImageUrls({}, ["a_url"], ["1.jpg", "2.jpg"], 1);

  assert.equal(settings.a_url, "2.jpg");
});

test("sin fotos no se toca nada", () => {
  const { settings, used } = fillImageUrls({ heading: "Hola" }, ["foto_url"], []);

  assert.deepEqual(settings, { heading: "Hola" });
  assert.equal(used, 0);
});

/* ------------------------------ Arreglar el esquema ------------------------ */

function conDefaults(settings: unknown, blocks?: unknown): string {
  return `<div class="lp">{{ section.settings.heading }}</div>
{% schema %}
${JSON.stringify({ name: "X", settings, ...(blocks ? { blocks } : {}), presets: [{ name: "X" }] }, null, 2)}
{% endschema %}`;
}

test("un default vacío se quita: Shopify rechaza el archivo entero por eso", () => {
  // «setting with id="badge_url" default can't be blank». Un ajuste puede no
  // tener default, pero si lo tiene no puede estar vacío.
  const { source, removed } = stripBlankDefaults(
    conDefaults([
      { type: "text", id: "badge_url", default: "" },
      { type: "text", id: "heading", default: "Hola" },
    ]),
  );

  const schema = JSON.parse(/{% schema %}([\s\S]*?){% endschema %}/.exec(source)![1]);

  assert.equal(removed, 1);
  assert.equal("default" in schema.settings[0], false);
  assert.equal(schema.settings[1].default, "Hola", "el que sí tiene valor se queda");
});

test("también los de dentro de los bloques", () => {
  const { removed } = stripBlankDefaults(
    conDefaults(
      [{ type: "text", id: "heading" }],
      [{ type: "resena", settings: [{ type: "text", id: "avatar_url", default: "" }] }],
    ),
  );

  assert.equal(removed, 1);
});

test("un default de solo espacios también está vacío para Shopify", () => {
  assert.equal(stripBlankDefaults(conDefaults([{ type: "text", id: "x", default: "   " }])).removed, 1);
});

test("un cero o un false son valores, no huecos", () => {
  // Quitarlos cambiaría el comportamiento de la sección.
  const { removed } = stripBlankDefaults(
    conDefaults([
      { type: "range", id: "padding", default: 0 },
      { type: "checkbox", id: "activo", default: false },
    ]),
  );

  assert.equal(removed, 0);
});

test("sin nada que quitar se devuelve tal cual", () => {
  const source = conDefaults([{ type: "text", id: "heading", default: "Hola" }]);

  assert.equal(stripBlankDefaults(source).source, source);
});

test("y el arreglo deja el archivo listo para la revisión", () => {
  const arreglado = stripBlankDefaults(
    conDefaults([{ type: "text", id: "heading", default: "" }]),
  ).source;

  assert.deepEqual(reviewSection(arreglado).problems, []);
});

test("un esquema ilegible no se toca aquí: ya lo caza la revisión", () => {
  const roto = `<div>x</div>\n{% schema %}\n{ "name": "X", }\n{% endschema %}`;

  assert.deepEqual(stripBlankDefaults(roto), { source: roto, removed: 0 });
});
