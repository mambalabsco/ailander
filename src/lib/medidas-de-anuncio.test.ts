import assert from "node:assert/strict";
import { test } from "node:test";
import { reglaDeMedidas, PATRON_DESCRIPCION } from "./medidas-de-anuncio.ts";

test("la regla dice los dos números, para que el encargo no se separe del recorte", () => {
  /*
   * Este es el fallo que cierra la prueba. El encargo de anuncio corto pedía
   * «una o dos frases» de titular y una descripción de cinco campos separados
   * por punto medio, y el servidor recortaba a 40 y 30 sin decírselo a nadie.
   * Salían titulares a media frase y **la misma** descripción en todos los
   * anuncios: la marca, el separador y nada más.
   */
  const regla = reglaDeMedidas({ headline: 40, description: 30 });

  assert.match(regla, /40/);
  assert.match(regla, /30/);
});

test("los números salen de lo que se le pase, no escritos a fijo", () => {
  // Si mañana cambian los límites de Meta, el encargo tiene que cambiar con
  // ellos. Escribirlos a mano aquí es cómo nació el fallo.
  const regla = reglaDeMedidas({ headline: 55, description: 44 });

  assert.match(regla, /55/);
  assert.match(regla, /44/);
  assert.ok(!regla.includes("40"), "no debería llevar el 40 escrito a fijo");
});

test("el patrón de descripción cabe en su límite", () => {
  /*
   * `Marca · Oferta · Envío · Garantía · Zona` era el patrón anterior: cinco
   * campos que no caben en treinta caracteres ni con las palabras más cortas
   * imaginables. El ejemplo que se le enseña al modelo tiene que caber, o le
   * estamos pidiendo algo imposible y quitándoselo después.
   */
  assert.ok(
    PATRON_DESCRIPCION.length <= 30,
    `«${PATRON_DESCRIPCION}» son ${PATRON_DESCRIPCION.length} caracteres y el límite es 30`,
  );
});

test("la regla enseña el patrón que de verdad cabe", () => {
  const regla = reglaDeMedidas({ headline: 40, description: 30 });
  assert.ok(regla.includes(PATRON_DESCRIPCION));
});

test("avisa de que el titular es una sola frase", () => {
  // «Una o dos frases» es lo que pedía antes, y dos frases no caben en 40.
  const regla = reglaDeMedidas({ headline: 40, description: 30 });
  assert.match(regla, /una sola frase/i);
});
