import assert from "node:assert/strict";
import { test } from "node:test";
import { tandaDeImagenes } from "./tanda-de-imagenes.ts";

const anuncio = (id: string, imagePrompt = `prompt de ${id}`) => ({
  id,
  name: `AD_${id}`,
  imagePrompt,
  format: "prueba-social",
});

test("separa los que no tienen imagen de los que ya tienen", () => {
  const { faltan, yaEstan } = tandaDeImagenes([anuncio("a"), anuncio("b")], [{ adId: "a" }]);

  assert.deepEqual(
    faltan.map((v) => v.adId),
    ["b"],
  );
  assert.deepEqual(
    yaEstan.map((v) => v.adId),
    ["a"],
  );
});

test("cada visual lleva el adId de su anuncio, no el del primero", () => {
  const { faltan } = tandaDeImagenes([anuncio("a"), anuncio("b")], []);

  assert.deepEqual(
    faltan.map((v) => v.adId),
    ["a", "b"],
  );
  assert.equal(faltan[1].prompt, "prompt de b");
  assert.equal(faltan[1].title, "AD_b");
});

test("un anuncio sin prompt no entra en ninguna de las dos listas", () => {
  // Contarlo como «falta» daría un botón que promete dos y genera una.
  const { faltan, yaEstan } = tandaDeImagenes([anuncio("a"), anuncio("b", "")], []);

  assert.deepEqual(
    faltan.map((v) => v.adId),
    ["a"],
  );
  assert.deepEqual(yaEstan, []);
});

test("un prompt de solo espacios cuenta como vacío", () => {
  const { faltan, yaEstan } = tandaDeImagenes([anuncio("a", "   \n  ")], []);

  assert.deepEqual(faltan, []);
  assert.deepEqual(yaEstan, []);
});

test("las imágenes sueltas, sin anuncio, no cuentan como suyas", () => {
  // Las de un copy o de una landing llegan con adId vacío: si contaran, un
  // anuncio sin imagen propia parecería tenerla y el botón lo saltaría.
  const { faltan } = tandaDeImagenes([anuncio("a")], [{ adId: undefined }]);

  assert.deepEqual(
    faltan.map((v) => v.adId),
    ["a"],
  );
});

test("el lote de una campaña es la suma del de sus conjuntos", () => {
  /*
   * La cabecera de la campaña y la de cada conjunto usan la misma función, así
   * que lo que promete la de arriba tiene que ser lo que suman las de abajo. Si
   * dejaran de cuadrar, el botón de campaña mentiría y nadie lo notaría hasta
   * pagar la tanda.
   */
  const conjuntoUno = [anuncio("a"), anuncio("b")];
  const conjuntoDos = [anuncio("c"), anuncio("d", "")];
  const imagenes = [{ adId: "b" }];

  const campana = tandaDeImagenes([...conjuntoUno, ...conjuntoDos], imagenes);
  const uno = tandaDeImagenes(conjuntoUno, imagenes);
  const dos = tandaDeImagenes(conjuntoDos, imagenes);

  assert.equal(campana.faltan.length, uno.faltan.length + dos.faltan.length);
  assert.equal(campana.yaEstan.length, uno.yaEstan.length + dos.yaEstan.length);
});

test("la creatividad llega con lo que la acción necesita para nombrarla", () => {
  const [visual] = tandaDeImagenes([anuncio("a")], []).faltan;

  assert.equal(visual.aspectRatio, "1:1");
  assert.equal(visual.concept, "prueba-social");
  // El nombre del anuncio da nombre al archivo: sin `origin` la descarga sale
  // como «subida_07» y no se sabe de cuál de los veinte salió.
  assert.equal(visual.origin, "AD_a");
});
