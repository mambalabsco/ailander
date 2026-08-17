import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTRUCCIONES_VISUALES, reglasVisuales } from "./gramatica-visual.ts";
import { SHORT_AD_FORMATS } from "../types/campaign.ts";

test("todo formato conocido tiene su instrucción visual escrita", () => {
  /*
   * La prueba que de verdad importa, y es de deriva.
   *
   * Si añades un formato y olvidas su instrucción, el encargo dice literalmente
   * «Decide tú el tratamiento visual y descríbelo» y **no falla nada**: sale una
   * imagen genérica y nadie sabe por qué. Es el mismo fallo que el titular
   * recortado — el encargo y el catálogo separándose en silencio.
   */
  const sinInstruccion = SHORT_AD_FORMATS.filter((id) => !INSTRUCCIONES_VISUALES[id]);

  assert.deepEqual(sinInstruccion, [], `sin instrucción visual: ${sinInstruccion.join(", ")}`);
});

test("no sobra ninguna instrucción de un formato que ya no existe", () => {
  const conocidos = new Set<string>(SHORT_AD_FORMATS);
  const huerfanas = Object.keys(INSTRUCCIONES_VISUALES).filter((id) => !conocidos.has(id));

  assert.deepEqual(huerfanas, []);
});

/**
 * Busca una frase sin que un salto de línea la parta.
 *
 * Las reglas son prosa ajustada a un ancho, así que «un cuarto del alto» puede
 * quedar cortado entre dos líneas de un día para otro. Comparar contra el texto
 * literal haría fallar la prueba por reajustar un párrafo, que es ruido: lo que
 * se comprueba es que la regla **esté**, no dónde cae el salto.
 */
function dice(texto: string, frase: string): boolean {
  return new RegExp(frase.split(" ").join("\\s+"), "i").test(texto);
}

test("las reglas piden tres viñetas y no cinco", () => {
  // Las referencias ponen tres. El encargo anterior pedía cinco y llenaba la
  // imagen de texto que no se lee en el feed.
  const reglas = reglasVisuales({ total: 10 });

  assert.ok(dice(reglas, "tres viñetas"));
  assert.ok(!dice(reglas, "cinco viñetas"));
});

test("las reglas exigen la medida del titular, no «grande»", () => {
  // «Grande» es relativo y un modelo lo lee como grandecito. Un cuarto del alto
  // no se puede interpretar.
  assert.ok(dice(reglasVisuales({ total: 10 }), "un cuarto del alto"));
});

test("las reglas prohíben la letra pequeña", () => {
  assert.ok(dice(reglasVisuales({ total: 10 }), "letra pequeña"));
});

test("las reglas dicen cuántos anuncios comparten paleta", () => {
  /*
   * El número tiene que ser el de la tanda real: escribir «todos» deja al modelo
   * decidir cuántos son.
   *
   * Con un total de una cifra esta prueba no valdría nada: las reglas van
   * numeradas del 1 al 7, así que un `/7/` acertaría sin que el total apareciera
   * por ninguna parte. Por eso 23.
   */
  assert.match(reglasVisuales({ total: 23 }), /23/);
});

test("el dispositivo es la primera regla y prohíbe la rejilla neutra", () => {
  const reglas = reglasVisuales({ total: 10 });

  assert.match(reglas, /dispositivo/i);
  assert.match(reglas, /rejilla/i);
});
