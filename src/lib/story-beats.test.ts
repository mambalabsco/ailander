import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BEAT_KINDS,
  BEAT_META,
  FORBIDDEN,
  buildBeatExtractionPrompt,
  buildBeatImagePrompt,
  quoteIsReal,
  type StoryBeat,
} from "./story-beats.ts";

const BODY = `Me senté en el borde de la cama a las tres de la tarde, todavía con la ropa del trabajo puesta.
No estaba triste. Estaba vacía.

Lo que me hizo ir al médico no fue el cansancio. Fue el desagüe de la ducha.

El análisis decía TSH 6,8. La doctora lo miró dos segundos y me dijo que estaba «en el límite».`;

/* ------------------------- La cita tiene que existir ------------------------ */

test("una cita que está en el texto se acepta", () => {
  assert.ok(quoteIsReal("Fue el desagüe de la ducha", BODY));
  // El modelo reescribe el espaciado al copiar; eso no debe invalidarla.
  assert.ok(quoteIsReal("  Fue  el   desagüe de la ducha  ", BODY));
  assert.ok(quoteIsReal("FUE EL DESAGÜE DE LA DUCHA", BODY));
});

test("una cita inventada se rechaza", () => {
  /*
   * Es el fallo real que esto detecta: cuando el modelo no encuentra material en
   * la historia, rellena con una escena genérica de suplemento y le pone una
   * cita plausible que no está en el texto.
   */
  assert.equal(quoteIsReal("Me miré al espejo y no me reconocí", BODY), false);
});

test("las comillas y los guiones tipográficos no invalidan una cita buena", () => {
  assert.ok(quoteIsReal('me dijo que estaba "en el límite"', BODY));
});

test("una cita demasiado corta no cuenta como cita", () => {
  // «la cama» aparece en el texto, pero coincidiría por azar con casi cualquier
  // historia: no prueba que el modelo la haya leído.
  assert.equal(quoteIsReal("la cama", BODY), false);
  assert.equal(quoteIsReal("", BODY), false);
});

/* ----------------------------- Las siete escenas ---------------------------- */

test("cada tipo de escena tiene su ficha completa", () => {
  for (const kind of BEAT_KINDS) {
    const meta = BEAT_META[kind];
    assert.ok(meta.label.length > 0, `${kind} sin etiqueta`);
    assert.ok(meta.looksFor.length > 20, `${kind} sin criterio de búsqueda`);
    assert.ok(meta.whyItStops.length > 20, `${kind} sin razón`);
  }
});

test("solo una escena lleva el producto", () => {
  /*
   * Es la decisión de fondo de todo el archivo: el producto sobre fondo blanco
   * ya existe y no para a nadie. Si alguien marca todas las escenas con
   * producto, esta prueba avisa.
   */
  const withProduct = BEAT_KINDS.filter((kind) => BEAT_META[kind].showsProduct);

  assert.deepEqual(withProduct, ["vida-despues"]);
});

/* ------------------------- Las restricciones viajan ------------------------- */

test("el prompt de extracción lleva el texto del copy y pide citas literales", () => {
  const prompt = buildBeatExtractionPrompt({
    productName: "Naturox",
    audience: "mujeres de 35 a 55 en México",
    body: BODY,
    headline: "El análisis decía que estaba «bien»",
    count: 6,
  });

  assert.ok(prompt.includes(BODY), "el cuerpo del copy tiene que ir entero");
  assert.ok(prompt.includes("frase literal"), "debe exigir la cita");
  assert.ok(prompt.includes("6 escenas"));
});

test("lo prohibido va escrito en los dos prompts, no se deja al criterio del modelo", () => {
  /*
   * Un modelo al que le pides «una historia sobre tiroides» y le das libertad
   * acaba, con bastante probabilidad, en un quirófano. Y una creatividad que
   * Meta rechaza tiene un hook rate de cero, así que esto no es cosmético.
   */
  const extraction = buildBeatExtractionPrompt({
    productName: "Naturox",
    audience: "mujeres de 35 a 55",
    body: BODY,
    headline: "titular",
    count: 5,
  });

  const beat: StoryBeat = {
    kind: "objeto-testigo",
    quote: "Fue el desagüe de la ducha",
    scene: "El desagüe de una ducha con pelo alrededor",
    composition: "Cenital muy cercano de un desagüe, luz de baño, sin nadie en el encuadre",
  };

  const image = buildBeatImagePrompt({
    beat,
    productName: "Naturox",
    audience: "mujeres de 35 a 55",
    withProduct: false,
  });

  for (const prompt of [extraction, image]) {
    assert.ok(prompt.includes("cirugía"), "falta el bloqueo de cirugía");
    assert.ok(prompt.includes("amputaciones"), "falta el bloqueo de amputaciones");
    assert.ok(prompt.includes("sangre"), "falta el bloqueo de sangre");
  }

  assert.ok(FORBIDDEN.includes("no usar el producto lleva a una enfermedad grave"));
});

test("el prompt de imagen dice explícitamente si el producto sale o no", () => {
  const beat: StoryBeat = {
    kind: "vida-despues",
    quote: "Volví a salir a caminar por las mañanas",
    scene: "Una mujer atándose las zapatillas en el recibidor",
    composition: "Luz de mañana entrando por la puerta, encuadre a la altura del suelo",
  };

  const con = buildBeatImagePrompt({
    beat,
    productName: "Naturox",
    audience: "mujeres de 35 a 55",
    withProduct: true,
  });
  const sin = buildBeatImagePrompt({
    beat,
    productName: "Naturox",
    audience: "mujeres de 35 a 55",
    withProduct: false,
  });

  // Sin esta frase, el modelo mete el frasco en todas las escenas «por si acaso»
  // y las siete creatividades acaban pareciendo la misma.
  assert.ok(con.includes("aparece en la escena"));
  assert.ok(sin.includes("NO aparece"));
});

test("el prompt de imagen se puede leer sin contexto", () => {
  // Es lo que se le manda al generador tal cual: si depende de saber de qué
  // producto va, la imagen sale genérica.
  const image = buildBeatImagePrompt({
    beat: {
      kind: "documento",
      quote: "El análisis decía TSH 6,8",
      scene: "Un análisis de sangre sobre la mesa de la cocina",
      composition: "Papel con un valor subrayado a boli, taza al lado, luz de ventana",
    },
    productName: "Naturox",
    audience: "mujeres de 35 a 55 en México",
    withProduct: false,
  });

  assert.ok(image.includes("Papel con un valor subrayado"));
  assert.ok(image.includes("mujeres de 35 a 55 en México"));
  assert.ok(image.includes("4:5"), "debe llevar el formato de su tipo de escena");
});
