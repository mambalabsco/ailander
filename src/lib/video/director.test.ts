import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIRECTOR_TEMPLATES,
  MAX_PROMPT,
  directorBrief,
  findDirectorTemplate,
  stripFiller,
} from "./director.ts";

const GUION = "Me dolían las rodillas al bajar escaleras. Probé esto. Ya bajo sin pensarlo.";

/* --------------------------------- Relleno --------------------------------- */

test("el relleno se va", () => {
  const limpio = stripFiller("close-up of the bottle, 8k, ultra detailed, masterpiece");
  assert.equal(limpio, "close-up of the bottle");
});

test("lo que describe algo se queda", () => {
  const texto = "low angle, warm morning light through a window, slow push-in";
  assert.equal(stripFiller(texto), texto);
});

/*
 * Quitar por trozo de palabra rompe frases sin avisar: «epicentro» se queda en
 * «entro» y el prompt sigue pareciendo válido.
 */
test("solo palabras enteras", () => {
  assert.equal(stripFiller("el epicentro del problema"), "el epicentro del problema");
});

test("no deja comas huérfanas", () => {
  assert.equal(stripFiller("bottle on marble, masterpiece, morning light"), "bottle on marble, morning light");
});

test("da igual cómo esté escrito", () => {
  assert.equal(stripFiller("Bottle, MASTERPIECE, Award Winning"), "Bottle");
});

/* ------------------------------- Sin plantilla ------------------------------ */

/*
 * Sin plantilla es «yo ya sé lo que quiero». Añadirle secciones sería
 * discutirle el encargo a quien lo escribió.
 */
test("sin plantilla va el guion tal cual", () => {
  const { prompt } = directorBrief({ script: GUION });
  assert.equal(prompt, GUION);
});

test("sin plantilla también se le quita el relleno", () => {
  const { prompt } = directorBrief({ script: "bottle close-up, 8k" });
  assert.equal(prompt, "bottle close-up");
});

/* ------------------------------ Con plantilla ------------------------------- */

test("con plantilla va la estructura y el guion", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "ugc", seconds: 20 });

  assert.match(prompt, /## Estructura/);
  assert.match(prompt, /## Guion/);
  assert.match(prompt, /20 segundos/);
});

/*
 * El guion entra literal. Si el compositor lo tocara, el anuncio generado no
 * sería el que se aprobó y nadie se enteraría hasta verlo.
 */
test("el guion no se toca", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "problema-solucion" });
  assert.ok(prompt.includes(GUION));
});

test("cada plantilla pone sus partes numeradas", () => {
  for (const template of DIRECTOR_TEMPLATES) {
    const { prompt } = directorBrief({ script: GUION, templateId: template.id });

    for (const [index, beat] of template.beats.entries()) {
      assert.ok(prompt.includes(`${index + 1}. **${beat.title}**`), `${template.id}: ${beat.title}`);
    }
  }
});

/*
 * Sin decir qué es la primera imagen, el modelo la trata como inspiración de
 * estilo y se dibuja su propio envase. Es el fallo que costó una tanda entera.
 */
test("se dice que la primera referencia es el envase", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "demo", references: 3 });
  assert.match(prompt, /primera es el envase real/);
});

test("sin referencias no se habla de imágenes", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "demo", references: 0 });
  assert.ok(!prompt.includes("Las imágenes que te mando"));
});

test("siempre se prohíbe el texto en pantalla", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "ugc" });
  assert.match(prompt, /Texto en pantalla/);
});

test("el nombre del producto entra cuando se sabe", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "ugc", productName: "Naturox" });
  assert.match(prompt, /se llama Naturox/);
});

/*
 * Pasarse del tope no avisa: el proveedor rechaza la petición entera y el fallo
 * llega como un 400 sin explicar cuál de los campos sobraba.
 */
test("se recorta al tope del proveedor y se dice cuánto", () => {
  const largo = "a".repeat(MAX_PROMPT + 500);
  const { prompt, trimmed } = directorBrief({ script: largo });

  assert.equal(prompt.length, MAX_PROMPT);
  assert.equal(trimmed, 500);
});

test("lo que cabe no se recorta", () => {
  assert.equal(directorBrief({ script: GUION }).trimmed, 0);
});

/* -------------------------------- Búsqueda ---------------------------------- */

test("una plantilla que no existe es null, no una por defecto", () => {
  assert.equal(findDirectorTemplate("no-existe"), null);
  assert.equal(findDirectorTemplate(""), null);
});

test("todas las plantillas tienen partes", () => {
  for (const template of DIRECTOR_TEMPLATES) {
    assert.ok(template.beats.length >= 3, template.id);
    assert.ok(template.label && template.note, template.id);
  }
});

/* ------------------------------- La continuidad ------------------------------ */

const TRAMO = [
  "## Qué parte de la historia es esta",
  "Este vídeo es el tramo 2 de 4.",
  "Y no cierres: después viene más.",
].join("\n");

/*
 * Sin esto, cada tramo de un anuncio largo cuenta la historia entera y salen
 * cuatro anuncios seguidos diciendo lo mismo.
 */
test("con plantilla, la continuidad va antes que la estructura", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "ugc", continuity: TRAMO });

  assert.ok(prompt.indexOf("tramo 2 de 4") < prompt.indexOf("## Estructura"));
});

/* No es estilo, es dónde encaja: callarla haría que el tramo 3 se creyera el
 * anuncio entero. */
test("sin plantilla la continuidad entra igual", () => {
  const { prompt } = directorBrief({ script: GUION, continuity: TRAMO });

  assert.match(prompt, /tramo 2 de 4/);
  assert.ok(prompt.includes(GUION));
});

test("sin continuidad no queda ningún hueco", () => {
  const { prompt } = directorBrief({ script: GUION, templateId: "ugc" });

  assert.ok(!prompt.includes("tramo"));
  assert.ok(!/\n\n\n/.test(prompt));
});

test("los segundos del encargo son los del tramo, no los del anuncio", () => {
  const { prompt } = directorBrief({ script: GUION, seconds: 13, continuity: TRAMO, templateId: "demo" });
  assert.match(prompt, /13 segundos/);
});
