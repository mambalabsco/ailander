import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyDraftTexts,
  applyTemplateTexts,
  collectDraftTexts,
  collectTemplateTexts,
} from "./theme-texts.ts";
import type { DraftLike } from "./theme-texts.ts";

const draft: DraftLike = {
  settings: {
    heading: "Duerme de un tirón",
    text: "Un complemento que no te deja atontado por la mañana.",
    button_label: "Lo quiero",
    button_link: "/products/melatonina",
    image: "shopify://shop_images/frasco.png",
    color_bg: "#0f172a",
    columns: 3,
    show_rating: true,
    empty: "",
  },
  blocks: [
    { type: "beneficio", settings: { title: "Sin resaca", body: "Te levantas entero." } },
    { type: "imagen", settings: { alt: "", src: "https://cdn.shop/1.png" } },
  ],
};

/* ------------------------------ Qué es texto -------------------------------- */

test("recoge los textos de la sección y de sus bloques", () => {
  const found = collectDraftTexts(draft);

  assert.deepEqual(
    found.map((item) => item.path),
    [
      "settings.heading",
      "settings.text",
      "settings.button_label",
      "blocks.0.settings.title",
      "blocks.0.settings.body",
    ],
  );
});

test("los enlaces, las imágenes y los colores no son texto", () => {
  // Reescribir un enlace deja la portada de una tienda con un botón que no
  // lleva a ninguna parte, y eso no da ningún error: se ve comprando.
  const paths = collectDraftTexts(draft).map((item) => item.path);

  assert.ok(!paths.includes("settings.button_link"));
  assert.ok(!paths.includes("settings.image"));
  assert.ok(!paths.includes("settings.color_bg"));
  assert.ok(!paths.includes("blocks.1.settings.src"));
});

test("lo que no es una cadena no se toca, y lo vacío no se manda", () => {
  const paths = collectDraftTexts(draft).map((item) => item.path);

  assert.ok(!paths.includes("settings.columns"));
  assert.ok(!paths.includes("settings.show_rating"));
  assert.ok(!paths.includes("settings.empty"));
  assert.ok(!paths.includes("blocks.1.settings.alt"));
});

test("el valor viaja con el texto, para poder enseñarlo antes de cambiarlo", () => {
  const found = collectDraftTexts(draft);

  assert.equal(found[0].value, "Duerme de un tirón");
});

/* --------------------------- Devolverlos a su sitio -------------------------- */

test("cada texto vuelve exactamente a su clave", () => {
  const next = applyDraftTexts(draft, [
    { path: "settings.heading", value: "Duerme sin pastillas" },
    { path: "blocks.0.settings.title", value: "Sin dependencia" },
  ]);

  assert.equal(next.settings.heading, "Duerme sin pastillas");
  assert.equal(next.blocks[0].settings.title, "Sin dependencia");
});

test("lo que no se manda se queda como estaba", () => {
  const next = applyDraftTexts(draft, [{ path: "settings.heading", value: "Otro titular" }]);

  assert.equal(next.settings.text, draft.settings.text);
  assert.equal(next.settings.button_link, "/products/melatonina");
});

test("no se modifica el original", () => {
  applyDraftTexts(draft, [{ path: "settings.heading", value: "Cambiado" }]);

  assert.equal(draft.settings.heading, "Duerme de un tirón");
});

test("una ruta que no existe se ignora, no se inventa la clave", () => {
  // El modelo devuelve a veces una ruta que no le dimos. Crearla metería un
  // ajuste que la sección no declara, y Shopify rechaza el tema entero.
  const next = applyDraftTexts(draft, [
    { path: "settings.inventado", value: "x" },
    { path: "blocks.9.settings.title", value: "y" },
    { path: "raro", value: "z" },
  ]);

  assert.equal("inventado" in next.settings, false);
  assert.equal(next.blocks.length, draft.blocks.length);
});

test("una ruta que existe pero no es texto se ignora", () => {
  // Es la otra mitad de lo mismo: si el modelo decide reescribir el enlace, no
  // se le deja, aunque la ruta sea real.
  const next = applyDraftTexts(draft, [{ path: "settings.button_link", value: "vete-a-saber" }]);

  assert.equal(next.settings.button_link, "/products/melatonina");
});

/* ----------------------- Lo mismo, sobre una plantilla ------------------------ */

/*
 * La plantilla es lo que está **vivo** en la tienda: el JSON de
 * `templates/index.json`, con una sección por clave y los bloques por clave
 * dentro. Es lo que hay que reescribir para que el cambio se vea.
 */
const template = JSON.stringify({
  sections: {
    hero: {
      type: "lp-hero",
      settings: { heading: "Duerme de un tirón", button_link: "/products/x" },
      blocks: {
        b1: { type: "punto", settings: { title: "Sin resaca" } },
      },
      block_order: ["b1"],
    },
    banda: { type: "image-banner", settings: { image: "shopify://x" } },
  },
  order: ["hero", "banda"],
});

test("recoge los textos de la plantilla con su sección y su bloque", () => {
  const found = collectTemplateTexts(template);

  assert.deepEqual(
    found.map((item) => item.path),
    ["sections.hero.settings.heading", "sections.hero.blocks.b1.settings.title"],
  );
});

test("los devuelve a su sitio sin tocar el resto de la plantilla", () => {
  const next = collectTemplateTexts(
    applyTemplateTexts(template, [
      { path: "sections.hero.settings.heading", value: "Duerme sin pastillas" },
    ]).json,
  );

  assert.equal(next[0].value, "Duerme sin pastillas");
  // El orden y las secciones ajenas siguen ahí: reescribir texto no puede
  // reordenar una portada ni tirar una sección del tema.
  const parsed = JSON.parse(applyTemplateTexts(template, []).json);
  assert.deepEqual(parsed.order, ["hero", "banda"]);
  assert.equal(parsed.sections.banda.settings.image, "shopify://x");
});

test("una plantilla ilegible se devuelve tal cual, sin romper nada", () => {
  // Shopify escribe una cabecera de comentario que JSON.parse rechaza, y ya ha
  // costado un fallo antes: aquí se prefiere no tocar a dejarla a medias.
  assert.equal(applyTemplateTexts("{ no es json", []).json, "{ no es json");
  assert.deepEqual(collectTemplateTexts("{ no es json"), []);
});

test("la cabecera de comentario de Shopify no puede dejar la plantilla por ilegible", () => {
  /*
   * **Aquí estaba el fallo.** Las plantillas de Shopify empiezan con un
   * comentario que el propio Shopify genera, y `JSON.parse` se atraganta con la
   * primera barra. Sin quitarlo, la plantilla se leía como ilegible: cero
   * textos, «no hay nada que reescribir» y ningún cambio — sin un solo error.
   */
  const conCabecera = `/*\n * IMPORTANT: The contents of this file are auto-generated.\n */\n${template}`;

  const found = collectTemplateTexts(conCabecera);

  assert.equal(found.length, 2);
  assert.equal(found[0].value, "Duerme de un tirón");

  const next = applyTemplateTexts(conCabecera, [
    { path: "sections.hero.settings.heading", value: "Duerme sin pastillas" },
  ]).json;

  assert.equal(JSON.parse(next).sections.hero.settings.heading, "Duerme sin pastillas");
});

test("dice cuántos textos se aplicaron de verdad, no cuántos le mandaron", () => {
  /*
   * **Aquí estaba el segundo fallo.** La acción contaba lo que devolvía el
   * modelo y lo daba por escrito, y el guardián de «no cambió nada» comparaba el
   * JSON reserializado contra el archivo original — que siempre difieren por el
   * formato y por la cabecera de Shopify. Resultado: escribía siempre y decía
   * que había ido bien siempre, con el texto intacto.
   */
  const conRutasMalas = applyTemplateTexts(template, [
    { path: "hero.settings.heading", value: "No se aplica" },
    { path: "sections.hero.settings.inventado", value: "Tampoco" },
  ]);

  assert.equal(conRutasMalas.applied, 0);

  const conUnaBuena = applyTemplateTexts(template, [
    { path: "sections.hero.settings.heading", value: "Sí se aplica" },
    { path: "hero.settings.heading", value: "Esta no" },
  ]);

  assert.equal(conUnaBuena.applied, 1);
});
