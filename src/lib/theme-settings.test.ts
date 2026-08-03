import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySettings,
  planColorChanges,
  planFontChanges,
  primaryScheme,
  readableOn,
  readSettings,
} from "./theme-settings.ts";

const CABECERA = `/*
 * ------------------------------------------------------------
 * IMPORTANT: The contents of this file are auto-generated.
 * ------------------------------------------------------------
 */
`;

function fichero(current: unknown, presets?: unknown): string {
  return CABECERA + JSON.stringify({ current, ...(presets ? { presets } : {}) }, null, 2);
}

const AJUSTES = {
  type_header_font: "assistant_n4",
  type_body_font: "assistant_n4",
  color_schemes: {
    "scheme-1": {
      settings: {
        background: "#FFFFFF",
        text: "#121212",
        button: "#121212",
        solid_button_label: "#ffffff",
      },
    },
    "scheme-2": { settings: { background: "#121212", text: "#ffffff" } },
  },
};

/* ------------------------------ Leer el fichero ---------------------------- */

test("la cabecera autogenerada no impide leerlo", () => {
  assert.ok(readSettings(fichero(AJUSTES)));
});

test("un tema sin tocar guarda los ajustes en el preestablecido, no en current", () => {
  // Es el caso de quien acaba de instalar el tema —o sea, justo quien va a
  // adaptarlo—. Leer solo `current` daría la cadena «Default» y ningún ajuste.
  const leido = readSettings(fichero("Default", { Default: AJUSTES }));

  assert.equal(leido?.presetName, "Default");
  assert.equal(leido?.values.type_header_font, "assistant_n4");
});

test("un fichero ilegible devuelve nada en vez de reventar", () => {
  assert.equal(readSettings("{ esto no es json"), null);
  assert.equal(readSettings(fichero("Falta", {})), null);
});

/* -------------------------------- Colores ---------------------------------- */

test("solo se toca el primer esquema, no todos", () => {
  const values = structuredClone(AJUSTES);
  assert.equal(primaryScheme(values), "scheme-1");

  const cambios = planColorChanges(values, [
    { hex: "#fff8f0", role: "fondo" },
    { hex: "#2b2b2b", role: "texto" },
  ]);

  assert.ok(cambios.every((cambio) => cambio.path.includes("scheme-1")));
  // El oscuro se queda como estaba: pisarlo dejaría la tienda plana.
  assert.ok(!cambios.some((cambio) => cambio.path.includes("scheme-2")));
});

test("un ajuste que el tema no declara no se propone", () => {
  const sinBoton = { color_schemes: { "scheme-1": { settings: { background: "#ffffff" } } } };

  const cambios = planColorChanges(sinBoton, [{ hex: "#ff3366", role: "botón" }]);

  assert.deepEqual(cambios, []);
});

test("un color que ya coincide no se propone, aunque venga en mayúsculas", () => {
  const cambios = planColorChanges(AJUSTES, [{ hex: "#ffffff", role: "fondo" }]);

  assert.deepEqual(cambios, []);
});

test("el texto del botón se calcula, no se hereda", () => {
  // Con un botón amarillo, heredar su blanco dejaría el texto ilegible.
  const cambios = planColorChanges(AJUSTES, [{ hex: "#ffd400", role: "botón" }]);
  const etiqueta = cambios.find((cambio) => cambio.label === "Texto del botón");

  assert.equal(etiqueta?.to, "#000000");
});

test("y sobre un color oscuro sale blanco", () => {
  assert.equal(readableOn("#1a1a1a"), "#ffffff");
  assert.equal(readableOn("#ffffff"), "#000000");
});

test("un rojo de marca lleva texto blanco, que es lo que se lee", () => {
  // Un umbral ingenuo en 0.5 mandaría negro aquí.
  assert.equal(readableOn("#c0202a"), "#ffffff");
});

/* ------------------------------ Tipografías -------------------------------- */

test("la primera fuente es la de los títulos y la segunda la del texto", () => {
  const cambios = planFontChanges(AJUSTES, [
    { family: "Archivo", handle: "archivo_n4" },
    { family: "Inter", handle: "inter_n4" },
  ]);

  assert.equal(cambios.find((c) => c.path === "type_header_font")?.to, "archivo_n4");
  assert.equal(cambios.find((c) => c.path === "type_body_font")?.to, "inter_n4");
});

test("con una sola fuente se usa para las dos cosas", () => {
  const cambios = planFontChanges(AJUSTES, [{ family: "Archivo", handle: "archivo_n4" }]);

  assert.equal(cambios.length, 2);
  assert.ok(cambios.every((cambio) => cambio.to === "archivo_n4"));
});

test("una fuente sin identificador no se aplica: rompería el tema", () => {
  assert.deepEqual(planFontChanges(AJUSTES, [{ family: "Poppins", handle: null }]), []);
});

/* ------------------------------- Escribirlo -------------------------------- */

test("aplicar deja el valor nuevo y no toca el resto", () => {
  const salida = applySettings(fichero(AJUSTES), [
    { path: "color_schemes.scheme-1.settings.background", label: "Fondo", from: "#FFFFFF", to: "#fff8f0" },
  ]);

  const leido = JSON.parse(salida!).current;

  assert.equal(leido.color_schemes["scheme-1"].settings.background, "#fff8f0");
  assert.equal(leido.color_schemes["scheme-1"].settings.text, "#121212");
  assert.equal(leido.color_schemes["scheme-2"].settings.background, "#121212");
});

test("un tema con preestablecido acaba con los ajustes en current", () => {
  // Es lo que hace el editor de Shopify al tocar el primer ajuste. Sin esto se
  // escribiría en un sitio que el tema no lee y no cambiaría nada.
  const salida = applySettings(fichero("Default", { Default: AJUSTES }), [
    { path: "type_header_font", label: "Fuente", from: "assistant_n4", to: "archivo_n4" },
  ]);

  const raiz = JSON.parse(salida!);

  assert.equal(typeof raiz.current, "object");
  assert.equal(raiz.current.type_header_font, "archivo_n4");
  // El preestablecido original se conserva, por si hay que volver.
  assert.equal(raiz.presets.Default.type_header_font, "assistant_n4");
});

test("un ajuste inexistente se salta en vez de inventarlo", () => {
  const salida = applySettings(fichero(AJUSTES), [
    { path: "no_existe", label: "X", from: "a", to: "b" },
    { path: "color_schemes.scheme-9.settings.background", label: "Y", from: "a", to: "b" },
  ]);

  const raiz = JSON.parse(salida!);

  assert.equal("no_existe" in raiz.current, false);
  assert.equal("scheme-9" in raiz.current.color_schemes, false);
});

test("un fichero ilegible no se escribe a medias", () => {
  assert.equal(applySettings("{ roto", [{ path: "a", label: "A", from: "1", to: "2" }]), null);
});

/* ------------------- Lo que no se puede perder al escribir ------------------ */

/*
 * El fallo que persigue esto: el logotipo desaparece y el tema enseña el nombre
 * de la tienda en texto. No da ningún error — un logotipo en blanco es un
 * estado válido— así que la única forma de cazarlo es no dejar que ocurra.
 */
const CON_PRESET = JSON.stringify(
  {
    current: "Default",
    presets: {
      Default: {
        logo: "shopify://shop_images/logo.png",
        favicon: "shopify://shop_images/favicon.png",
        color_schemes: { "scheme-1": { settings: { background: "#ffffff" } } },
      },
    },
  },
  null,
  2,
);

const SIN_PRESET = JSON.stringify(
  {
    current: {
      logo: "shopify://shop_images/logo.png",
      color_schemes: { "scheme-1": { settings: { background: "#ffffff" } } },
    },
  },
  null,
  2,
);

const CAMBIO = [
  {
    path: "color_schemes.scheme-1.settings.background",
    label: "Fondo",
    from: "#ffffff",
    to: "#000000",
  },
];

/*
 * El logotipo vive en los ajustes del tema y aquí solo se tocan colores y
 * letras. Que sobreviva es lo que hay que poder afirmar, venga el fichero con
 * preestablecido o sin él.
 */
test("el logotipo sobrevive venga como venga el fichero", () => {
  const conPreset = JSON.parse(applySettings(CON_PRESET, CAMBIO)!);
  const sinPreset = JSON.parse(applySettings(SIN_PRESET, CAMBIO)!);

  assert.equal(conPreset.current.logo, "shopify://shop_images/logo.png");
  assert.equal(sinPreset.current.logo, "shopify://shop_images/logo.png");

  // Y el preestablecido original se conserva por si hay que volver.
  assert.equal(conPreset.presets.Default.logo, "shopify://shop_images/logo.png");
});

test("sin preestablecido se escribe en `current`, como siempre", () => {
  const salida = JSON.parse(applySettings(SIN_PRESET, CAMBIO)!);

  assert.equal(typeof salida.current, "object");
  assert.equal(salida.current.color_schemes["scheme-1"].settings.background, "#000000");
});

test("no se inventan ajustes que el tema no declara", () => {
  const salida = JSON.parse(
    applySettings(SIN_PRESET, [
      { path: "no_existe", label: "x", from: "a", to: "b" },
    ])!,
  );

  assert.equal("no_existe" in salida.current, false);
});
