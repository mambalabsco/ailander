import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAPTION_MAX,
  HASHTAG_MAX,
  VISIBLE_MAX,
  buildCaption,
  buildContentPrompt,
  buildFocusNote,
  cleanHashtags,
  findFormat,
  visiblePart,
} from "./content.ts";

test("las etiquetas se limpian y no pasan de treinta", () => {
  /*
   * Pasar de treinta no da error: Instagram las ignora **todas**. Callarse el
   * exceso saldría como una publicación sin ninguna etiqueta, que es lo
   * contrario de lo que se pretendía.
   */
  const muchas = Array.from({ length: 40 }, (_, i) => `#Tag${i}`);

  assert.equal(cleanHashtags(muchas).length, HASHTAG_MAX);
  assert.deepEqual(cleanHashtags(["#Tinnitus", "tinnitus", " TINNITUS "]), ["tinnitus"]);
  assert.deepEqual(cleanHashtags(["##dos", "con espacio"]), ["dos", "conespacio"]);
  assert.deepEqual(cleanHashtags(["", "  ", "#"]), []);
});

test("si no cabe se recorta el texto, no las etiquetas", () => {
  // El texto ya dijo lo suyo en la primera línea; unas etiquetas a medias no
  // clasifican nada.
  const caption = buildCaption({ text: "x".repeat(CAPTION_MAX), hashtags: ["uno", "dos"] });

  assert.ok(caption.length <= CAPTION_MAX);
  assert.ok(caption.endsWith("#uno #dos"));
});

test("las etiquetas van al final y separadas", () => {
  assert.equal(buildCaption({ text: "Duerme mejor.", hashtags: ["sueño"] }), "Duerme mejor.\n\n#sueño");
});

test("la parte visible se corta por palabra", () => {
  /*
   * Instagram corta a los 125 con un «más» que casi nadie pulsa. La vista
   * previa tiene que enseñar exactamente eso, y cortado a media palabra se lee
   * como un error nuestro y no como lo que va a pasar.
   */
  const visible = visiblePart(`${"palabra ".repeat(30)}final`);

  assert.ok(visible.length <= VISIBLE_MAX);
  assert.ok(!visible.endsWith(" "));
  assert.equal(visiblePart("Corto"), "Corto", "lo que cabe no se toca");
});

test("cada formato lleva su proporción, y el vídeo su duración", () => {
  assert.equal(findFormat("reel").aspectRatio, "9:16");
  assert.equal(findFormat("feed").aspectRatio, "4:5");
  assert.deepEqual(findFormat("reel").seconds, [3, 90]);
  assert.equal(findFormat("feed").seconds, undefined, "una foto no dura");

  // Un formato inventado no rompe: cae en el primero.
  assert.equal(findFormat("inventado").id, "feed");
});

test("el encargo dice que la primera línea es lo único que se lee", () => {
  const prompt = buildContentPrompt({
    format: findFormat("reel"),
    productName: "TiniCalm",
    audience: "mayores de 50",
    country: "Chile",
    count: 3,
  });

  assert.ok(prompt.includes(String(VISIBLE_MAX)));
  assert.ok(prompt.includes("sin pulsar «más»"));
  assert.ok(prompt.includes("3 y 90 segundos"), "la duración del formato");
  assert.ok(prompt.includes("no qué se siente"), "la escena, filmable");
  assert.ok(prompt.includes("curar"), "sin promesas médicas");
});

test("el enfoque entra en el encargo con las palabras de quien lo pidió", () => {
  /*
   * Parafrasearlo lo estropea: «insiste en el sueño» y «habla de descanso
   * nocturno» no piden lo mismo, y quien lo dijo no reconoce lo segundo.
   */
  const nota = buildFocusNote("  insiste en el sueño  ");

  assert.ok(nota.includes("insiste en el sueño"), "va literal");
  assert.ok(!nota.includes("  insiste"), "sin los espacios de sobra");
  assert.ok(nota.toLowerCase().includes("todas"), "manda para todas las piezas de la tanda");
});

test("sin enfoque no se añade una sección vacía", () => {
  // Un «## En qué insistir» sin nada debajo invita a inventarse un tema.
  assert.equal(buildFocusNote(""), "");
  assert.equal(buildFocusNote("   "), "");
});
