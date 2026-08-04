import assert from "node:assert/strict";
import { test } from "node:test";

import { planSegments, segmentInstruction, sliceScript, totalSeconds } from "./segments.ts";

const uno = { index: 1, total: 1, seconds: 15, from: 0, to: 15 };

/* -------------------------------- El reparto -------------------------------- */

test("lo que cabe en una pieza va en una pieza", () => {
  const segments = planSegments({ seconds: 12, maxSeconds: 15 });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].seconds, 12);
});

/*
 * El fallo que lo empezó todo: 50 s pedidos a un generador de 15 daban un solo
 * vídeo de 15 con el guion de 50 dentro, al triple de velocidad.
 */
test("cincuenta segundos en un generador de quince salen en cuatro tramos", () => {
  const segments = planSegments({ seconds: 50, maxSeconds: 15 });

  assert.equal(segments.length, 4);
  assert.ok(totalSeconds(segments) >= 50);
});

/*
 * Repartido parejo, no «llenar y lo que sobre»: 15+15+15+5 deja un último plano
 * de cinco segundos que parece que se cortó.
 */
test("los tramos duran lo mismo entre ellos", () => {
  const segments = planSegments({ seconds: 50, maxSeconds: 15 });
  const distintos = new Set(segments.map((segment) => segment.seconds));

  assert.equal(distintos.size, 1);
  assert.equal(segments[0].seconds, 13);
});

/* Redondeando hacia abajo, el anuncio dura menos que lo encargado — y lo que se
 * pierde es el final. */
test("el reparto nunca se queda corto", () => {
  for (const seconds of [20, 33, 45, 50, 61, 90]) {
    assert.ok(totalSeconds(planSegments({ seconds, maxSeconds: 15 })) >= seconds, String(seconds));
  }
});

test("ningún tramo pasa del tope del generador", () => {
  for (const seconds of [20, 50, 120]) {
    for (const segment of planSegments({ seconds, maxSeconds: 15 })) {
      assert.ok(segment.seconds <= 15, String(seconds));
    }
  }
});

test("los tramos van seguidos y sin huecos", () => {
  const segments = planSegments({ seconds: 40, maxSeconds: 15 });

  for (const [index, segment] of segments.entries()) {
    assert.equal(segment.index, index + 1);
    if (index > 0) assert.equal(segment.from, segments[index - 1].to);
  }
});

/*
 * Pedirle un 7 a un modelo que vende 5, 10 y 15 no redondea: rechaza la
 * petición. Y quedarse en 5 acorta el anuncio sin decirlo.
 */
test("con lista cerrada se coge un valor que vende y que no se queda corto", () => {
  const segments = planSegments({ seconds: 40, maxSeconds: 15, durations: [5, 10, 15] });

  assert.ok(segments.every((segment) => [5, 10, 15].includes(segment.seconds)));
  assert.ok(totalSeconds(segments) >= 40);
});

test("un encargo absurdo no cuelga ni devuelve cero tramos", () => {
  assert.equal(planSegments({ seconds: 0, maxSeconds: 15 }).length, 1);
  assert.equal(planSegments({ seconds: -5, maxSeconds: 15 }).length, 1);
});

/* ------------------------------ Las instrucciones --------------------------- */

/* Con una sola pieza no hay nada que explicar, y explicarlo la confunde. */
test("una pieza sola no lleva instrucciones de tramo", () => {
  assert.equal(segmentInstruction(uno), "");
});

test("cada tramo sabe cuál es y qué parte cubre", () => {
  const [primero, , tercero] = planSegments({ seconds: 45, maxSeconds: 15 });

  assert.match(segmentInstruction(primero), /tramo 1 de 3/);
  assert.match(segmentInstruction(tercero), /tramo 3 de 3/);
});

/*
 * Sin esto, cada tramo recibe el guion entero e intenta contar la historia
 * completa: cuatro anuncios de quince segundos que dicen lo mismo.
 */
test("se le dice que cuente solo su parte", () => {
  const [primero] = planSegments({ seconds: 45, maxSeconds: 15 });
  assert.match(segmentInstruction(primero), /solo esa parte/);
});

test("el primero no continúa nada", () => {
  const [primero] = planSegments({ seconds: 45, maxSeconds: 15 });
  assert.ok(!segmentInstruction(primero).includes("último fotograma del tramo anterior"));
});

test("los siguientes reciben el último fotograma del anterior", () => {
  const [, segundo] = planSegments({ seconds: 45, maxSeconds: 15 });
  const texto = segmentInstruction(segundo);

  assert.match(texto, /último fotograma del tramo\nanterior/);
  assert.match(texto, /no vuelvas a presentar a nadie/);
});

/*
 * El error de la primera versión: se pedía «mismo sitio, misma ropa, misma
 * cara», y eso da un anuncio en el que alguien mira a cámara cincuenta segundos.
 * Un anuncio corta: hay partes que son el envase solo, unas manos, un detalle.
 */
test("el fotograma no obliga a que salga la persona", () => {
  const [, segundo] = planSegments({ seconds: 45, maxSeconds: 15 });
  const texto = segmentInstruction(segundo);

  assert.match(texto, /\*\*no\*\* es: una obligación de seguir ese plano/);
  assert.match(texto, /si lo que\ntoca contar aquí no la necesita, no sale/);
});

test("pero si vuelve a salir tiene que ser la misma", () => {
  const [, segundo] = planSegments({ seconds: 45, maxSeconds: 15 });
  assert.match(segmentInstruction(segundo), /la misma persona/);
});

/* Un anuncio que acaba tres veces se lee como tres anuncios. */
test("solo el último cierra", () => {
  const segments = planSegments({ seconds: 45, maxSeconds: 15 });

  assert.match(segmentInstruction(segments[0]), /no cierres el anuncio/);
  assert.match(segmentInstruction(segments[2]), /aquí se cierra/);
  assert.ok(!segmentInstruction(segments[2]).includes("no cierres"));
});

/* --------------------------------- El guion --------------------------------- */

const GUION = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(" ");

test("con una sola pieza va el guion entero", () => {
  assert.equal(sliceScript(GUION, uno), GUION);
});

test("cada tramo se lleva su trozo, en orden y sin repetir", () => {
  const segments = planSegments({ seconds: 45, maxSeconds: 15 });
  const trozos = segments.map((segment) => sliceScript(GUION, segment));

  assert.equal(trozos.join(" "), GUION);
  assert.ok(trozos.every((trozo) => trozo.length > 0));
});

/* Las últimas palabras de un anuncio son el cierre: no pueden caerse por un
 * redondeo. */
test("el último se lleva lo que quede", () => {
  const segments = planSegments({ seconds: 45, maxSeconds: 15 });
  const ultimo = sliceScript(GUION, segments[segments.length - 1]);

  assert.ok(ultimo.endsWith("palabra39"));
});

test("no se corta a media palabra", () => {
  const segments = planSegments({ seconds: 60, maxSeconds: 15 });

  for (const segment of segments) {
    for (const word of sliceScript(GUION, segment).split(" ")) {
      assert.ok(!word || /^palabra\d+$/.test(word), word);
    }
  }
});

test("un guion vacío no revienta el reparto", () => {
  const [primero] = planSegments({ seconds: 45, maxSeconds: 15 });
  assert.equal(sliceScript("   ", primero), "");
});

/*
 * El texto tiene que acabarse. Un anuncio que se corta a media frase no sirve,
 * y el reparto por palabras deja el final en el último tramo: hay que decirle
 * que ese final se oye entero.
 */
test("el último tramo tiene que decir el texto hasta el final", () => {
  const segments = planSegments({ seconds: 45, maxSeconds: 15 });
  const ultimo = segmentInstruction(segments[segments.length - 1]);

  assert.match(ultimo, /el final del texto/);
  assert.match(ultimo, /hasta la última frase/);
  assert.match(ultimo, /ajusta la\nimagen al texto y no al revés/);
});
