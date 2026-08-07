import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCopy,
  buildTemplateCopyPrompt,
  collectCopy,
  isCopyKey,
  isWorthRewriting,
  mainProductSection,
  productTemplateFrom,
  readTemplateCopy,
  type ProductTemplate,
} from "./product-template.ts";

/** Un recorte fiel de una plantilla real, con sus trampas dentro. */
const PLANTILLA: ProductTemplate = {
  sections: {
    detalle: {
      type: "shop-product-details",
      blocks: {
        rating: {
          type: "trustpilot_rating",
          settings: {
            rating_text: "Calificación",
            rating_score: '4.7 "Excelente" | Más de +858 Reseñas',
            text_color: "#000000",
            star_color: "#00b67a",
            font_size_desktop: 14,
            border_style: "none",
            link: "reviews",
          },
        },
        titulo: {
          type: "title",
          settings: {
            use_custom_title: false,
            custom_title: "Custom Product Title",
            font_size: 42,
            title_color: "#000000",
          },
        },
        beneficios: {
          type: "benefits_grid",
          settings: {
            benefit_1_text: "¡Únete a más de 93 mil personas que dicen — FUNCIONA!",
            benefit_1_use_image: true,
            benefit_1_custom_icon: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M320 576"/></svg>',
            benefit_2_text: "Restaura el ciclo linfático natural de tu cuerpo en 24 horas",
            text_color: "#25282a",
            icon_size: 24,
          },
        },
        inventario: {
          type: "limited_inventory",
          disabled: true,
          settings: { inventory_text: "Free Gift reserved for the next 53 orders!" },
        },
        widget: {
          type: "custom_liquid",
          settings: {
            custom_liquid: "<div class='fr-widget'><script>alert(1)</script></div>",
          },
        },
        regalo: {
          type: "custom_text",
          settings: {
            text: "<p><strong>REGALO «sculpt.» INCLUÍDO</strong></p>",
            text_align: "left",
            font_size: 12,
          },
        },
      },
    },
  },
};

test("el diseño no es texto, aunque la clave lleve «text» dentro", () => {
  /*
   * `text_color` y `text_align` son la trampa: pasan cualquier filtro que
   * busque «text» y son un color y una alineación. Reescribirlos deja la página
   * con `color: Rojo intenso` y el tema sin pintar.
   */
  assert.equal(isCopyKey("text_color"), false);
  assert.equal(isCopyKey("text_align"), false);
  assert.equal(isCopyKey("font_size_desktop"), false);
  assert.equal(isCopyKey("badge_border_radius"), false);
  assert.equal(isCopyKey("benefit_1_custom_icon"), false, "un SVG de dos mil caracteres");
  assert.equal(isCopyKey("custom_liquid"), false, "un widget entero con su JS");

  assert.equal(isCopyKey("rating_score"), true);
  assert.equal(isCopyKey("benefit_1_text"), true);
  assert.equal(isCopyKey("custom_title"), true);
  assert.equal(isCopyKey("text"), true);
});

test("los rellenos del tema no se reescriben", () => {
  // Un campo con «Custom Product Title» no está puesto: está por poner. Pedir
  // que se reescriba devuelve otro relleno igual de inútil, y cobrando.
  assert.equal(isWorthRewriting("Custom Product Title"), false);
  assert.equal(isWorthRewriting("Add additional descriptive text here"), false);
  assert.equal(isWorthRewriting("Variant 3 description"), false);
  assert.equal(isWorthRewriting(""), false);
  assert.equal(isWorthRewriting("<p></p>"), false, "vacío con etiquetas sigue vacío");

  assert.equal(isWorthRewriting("¡Únete a más de 93 mil personas!"), true);
  assert.equal(isWorthRewriting("<p><strong>REGALO INCLUÍDO</strong></p>"), true);
});

test("se recogen los textos de venta y nada más", () => {
  const fields = collectCopy(PLANTILLA);
  const paths = fields.map((field) => field.path);

  assert.ok(paths.includes("detalle.rating.rating_score"));
  assert.ok(paths.includes("detalle.beneficios.benefit_1_text"));
  assert.ok(paths.includes("detalle.beneficios.benefit_2_text"));
  assert.ok(paths.includes("detalle.regalo.text"));

  assert.ok(!paths.some((path) => path.endsWith("text_color")));
  assert.ok(!paths.some((path) => path.endsWith("custom_icon")));
  assert.ok(!paths.some((path) => path.endsWith("custom_liquid")));
  assert.ok(!paths.includes("detalle.titulo.custom_title"), "era un relleno del tema");

  // Un bloque desactivado está en el JSON pero no en la página: reescribirlo es
  // pagar por texto que nadie va a leer.
  assert.ok(!paths.some((path) => path.includes("inventario")));

  // El tipo del bloque viaja con el texto: sin él, «Calificación» es una
  // palabra suelta y el modelo no sabe que encabeza unas estrellas.
  const score = fields.find((field) => field.key === "rating_score");
  assert.equal(score?.block, "trustpilot_rating");
});

test("reescribir un texto no toca ningún otro ajuste", () => {
  const fields = collectCopy(PLANTILLA);
  const next = applyCopy(PLANTILLA, {
    "detalle.beneficios.benefit_1_text": "¡Ya somos 40 mil!",
  });

  const beneficios = next.sections?.detalle?.blocks?.beneficios?.settings;

  assert.equal(beneficios?.benefit_1_text, "¡Ya somos 40 mil!");
  assert.equal(beneficios?.text_color, "#25282a", "el color sigue donde estaba");
  assert.equal(beneficios?.icon_size, 24);
  assert.equal(
    next.sections?.detalle?.blocks?.widget?.settings?.custom_liquid,
    PLANTILLA.sections?.detalle?.blocks?.widget?.settings?.custom_liquid,
    "el widget llega intacto",
  );

  // Y el original no se ha tocado: se publica lo que se devuelve, y una
  // plantilla modelo que se modifica sola deja de servir de modelo.
  assert.equal(
    PLANTILLA.sections?.detalle?.blocks?.beneficios?.settings?.benefit_1_text,
    "¡Únete a más de 93 mil personas que dicen — FUNCIONA!",
  );
  assert.ok(fields.length > 0);
});

test("una ruta que no existía no crea ajustes nuevos", () => {
  /*
   * Es la defensa contra una respuesta larga que se inventa un campo. Un ajuste
   * que el tema no declara rompe el editor con «Invalid schema», y el fallo
   * aparece en la tienda, no aquí.
   */
  const next = applyCopy(PLANTILLA, {
    "detalle.beneficios.benefit_9_text": "Inventado",
    "otra.seccion.text": "También inventado",
  });

  assert.ok(!("benefit_9_text" in (next.sections?.detalle?.blocks?.beneficios?.settings ?? {})));
  assert.ok(!next.sections?.otra);
});

test("del modelo solo se acepta lo que se le pidió", () => {
  const fields = collectCopy(PLANTILLA);

  const changes = readTemplateCopy(fields, [
    { path: "detalle.beneficios.benefit_1_text", text: "Nuevo beneficio" },
    { path: "detalle.beneficios.benefit_1_custom_icon", text: "<svg>malo</svg>" },
    { path: "inventado.del.modelo", text: "No" },
    { path: "detalle.regalo.text", text: "   " },
  ]);

  assert.deepEqual(changes, { "detalle.beneficios.benefit_1_text": "Nuevo beneficio" });
});

test("el prompt lleva cada texto con su ruta y su bloque", () => {
  const prompt = buildTemplateCopyPrompt({
    fields: collectCopy(PLANTILLA),
    productName: "Lymphatic Complex",
    audience: "mujeres de 30 a 55",
    country: "Chile",
    context: "Cápsulas para la retención de líquidos.",
  });

  assert.ok(prompt.includes("detalle.beneficios.benefit_1_text"));
  assert.ok(prompt.includes("trustpilot_rating"));
  assert.ok(prompt.includes("Lymphatic Complex"));
  assert.ok(prompt.includes("mujeres de 30 a 55"));
  assert.ok(prompt.includes("Chile"));
  assert.ok(prompt.includes("Cápsulas para la retención de líquidos."));
  assert.ok(prompt.includes("no se inventan"), "las cifras de prueba social");
});

test("la sección de compra se saca del tema, no se da por sabida", () => {
  /*
   * Cada tema la llama a su manera. Un nombre inventado no da error: Shopify
   * pinta la plantilla sin esa sección, y la página sale sin precio ni botón.
   */
  assert.equal(
    mainProductSection('{"sections":{"main":{"type":"main-product"}},"order":["main"]}'),
    "main-product",
  );

  assert.equal(
    mainProductSection('{"sections":{"cabecera":{"type":"banner"},"x":{"type":"product-information"}}}'),
    "product-information",
    "si no se llama «main», la que lleve «product»",
  );

  assert.equal(mainProductSection("{no es json}"), null);
  assert.equal(mainProductSection('{"sections":{"a":{"type":"banner"}}}'), null, "no se inventa");
});

test("la sección de compra va primera en la plantilla armada", () => {
  // En una página larga copiada de una landing, todo lo demás son argumentos.
  // Dejarla al final obliga a recorrerla entera para poder comprar.
  const json = productTemplateFrom({
    sectionNames: ["copia-01", "copia-02"],
    mainSection: "main-product",
  });

  const parsed = JSON.parse(json);

  assert.deepEqual(parsed.order, ["main", "copia-01", "copia-02"]);
  assert.equal(parsed.sections.main.type, "main-product");
  assert.equal(parsed.sections["copia-02"].type, "copia-02");
});

test("sin sección de compra la plantilla se arma igual", () => {
  // Un tema raro del que no se pudo sacar: mejor la página sin botón que
  // ninguna página, y el aviso lo da quien llama.
  const parsed = JSON.parse(
    productTemplateFrom({ sectionNames: ["copia-01"], mainSection: null }),
  );

  assert.deepEqual(parsed.order, ["copia-01"]);
  assert.ok(!parsed.sections.main);
});
