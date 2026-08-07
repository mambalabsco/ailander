import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DESCRIPTION_MAX,
  HEADLINE_MAX,
  buildVideoCopyPrompt,
  fitAdCopy,
  fitAdField,
  videoScript,
} from "./ad-copy.ts";

const shot = (n: string, guion: string, sub?: string) => ({ n, guion, sub });

test("el guion se lee como se escribe, no como se pronuncia", () => {
  /*
   * El guion va en fonético para el generador de voz: «eme ce te». Redactar el
   * anuncio a partir de eso da un texto que vende «eme ce te», que es lo que
   * más delata un anuncio hecho a máquina.
   */
  const script = videoScript([
    shot("01", "Con eme ce te de coco", "Con MCT de coco"),
    shot("02", "Tómalo por la mañana"),
  ]);

  assert.equal(script, "Con MCT de coco Tómalo por la mañana");
});

test("las tomas vacías no dejan huecos en el guion", () => {
  // Una toma sin texto es normal: un plano de producto sin voz encima. Sin
  // esto, el guion llega al modelo con dobles espacios y frases sueltas.
  const script = videoScript([
    shot("01", "Primera"),
    shot("02", "   "),
    shot("03", "", ""),
    shot("04", "Última"),
  ]);

  assert.equal(script, "Primera Última");
});

test("un título que no cabe se corta por la palabra, no por la letra", () => {
  /*
   * Meta corta a 40 y 30 caracteres sin avisar, con puntos suspensivos en el
   * anuncio ya publicado. Cortar por la letra deja «sin pasar ham», que se lee
   * como un fallo de la plataforma y no como una frase.
   */
  const largo = "Adelgaza sin pasar hambre este verano contigo";
  const corto = fitAdField(largo, HEADLINE_MAX);

  assert.ok(corto.length <= HEADLINE_MAX);
  assert.ok(!corto.endsWith(" "));
  assert.equal(corto, "Adelgaza sin pasar hambre este verano");
});

test("una palabra sola más larga que el límite se corta igual", () => {
  // Preferible a devolver vacío: un anuncio sin título no se puede publicar.
  assert.equal(fitAdField("Supercalifragilisticoespialidoso", 10), "Supercalif");
});

test("lo que ya cabe no se toca, y los espacios de más se van", () => {
  assert.equal(fitAdField("  Prueba   el  pack  ", 40), "Prueba el pack");
});

test("los tres campos salen con la medida del gestor de anuncios", () => {
  const fitted = fitAdCopy({
    primaryText: "  Un cuerpo largo que no tiene límite duro aquí.  ",
    headline: "Un título bastante más largo de lo que Meta deja ver entero",
    description: "Una descripción que tampoco cabe en treinta",
  });

  assert.equal(fitted.primaryText, "Un cuerpo largo que no tiene límite duro aquí.");
  assert.ok(fitted.headline.length <= HEADLINE_MAX);
  assert.ok(fitted.description.length <= DESCRIPTION_MAX);
});

test("el prompt lleva el guion y los límites, y la duración solo si se sabe", () => {
  const con = buildVideoCopyPrompt({
    script: "Con MCT de coco",
    productName: "Lymphatic Complex",
    seconds: 42.6,
  });

  assert.ok(con.includes("Con MCT de coco"), "el guion entero");
  assert.ok(con.includes("Lymphatic Complex"));
  assert.ok(con.includes("43 segundos"), "redondeado, no 42.6");
  assert.ok(con.includes(String(HEADLINE_MAX)) && con.includes(String(DESCRIPTION_MAX)));

  // Sin montar todavía no hay duración que dar, y decir «0 segundos» sería
  // peor que no decir nada: el modelo escribiría para un vídeo inexistente.
  const sin = buildVideoCopyPrompt({
    script: "Con MCT de coco",
    productName: "Lymphatic Complex",
    seconds: 0,
  });

  assert.ok(!sin.includes("segundos."));
});
