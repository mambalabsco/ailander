import assert from "node:assert/strict";
import { test } from "node:test";

import { mostRecent } from "./recency.ts";

test("de veinte piezas salen las quince más nuevas, no las quince con la fecha de cola más próxima", () => {
  // El índice crece con la antigüedad al revés: "pieza-0" es la más vieja,
  // "pieza-19" la más nueva. `scheduled_at` ascendente (lo que usa listPosts
  // para la cola) las pondría en este mismo orden, que es justo el que hay
  // que dejar de recortar por el principio.
  const piezas = Array.from({ length: 20 }, (_, i) => ({
    id: `pieza-${i}`,
    scheduledAt: new Date(2026, 0, 1 + i).toISOString(),
    publishedAt: null,
  }));

  const ultimas = mostRecent(piezas, 15);

  assert.equal(ultimas.length, 15);

  const ids = ultimas.map((one) => one.id);
  // Las quince más nuevas: de "pieza-5" a "pieza-19".
  for (let i = 5; i < 20; i += 1) assert.ok(ids.includes(`pieza-${i}`), `falta ${`pieza-${i}`}`);
  // Ninguna de las cinco más viejas.
  for (let i = 0; i < 5; i += 1) assert.ok(!ids.includes(`pieza-${i}`), `no debería estar pieza-${i}`);

  // Y en orden de más nueva a más vieja.
  assert.equal(ids[0], "pieza-19");
  assert.equal(ids[14], "pieza-5");
});

test("un borrador sin fecha es lo más reciente de todo", () => {
  // Es el caso que rompía el filtro: se genera una tanda y no se programa al
  // momento. Sin fecha, esa tanda tiene que seguir contando como "lo último
  // escrito" y no caer al fondo por no tener scheduled_at.
  const piezas = [
    { id: "vieja-programada", scheduledAt: "2020-01-01T00:00:00.000Z", publishedAt: null },
    { id: "borrador-reciente", scheduledAt: null, publishedAt: null },
    { id: "vieja-publicada", scheduledAt: "2020-06-01T00:00:00.000Z", publishedAt: "2020-06-01T19:00:00.000Z" },
  ];

  const ultimas = mostRecent(piezas, 2);

  assert.deepEqual(
    ultimas.map((one) => one.id),
    ["borrador-reciente", "vieja-publicada"],
  );
});

test("publishedAt cubre cuando falta scheduledAt", () => {
  const piezas = [
    { id: "solo-programada", scheduledAt: "2026-01-01T00:00:00.000Z", publishedAt: null },
    { id: "solo-publicada", scheduledAt: null, publishedAt: "2026-06-01T00:00:00.000Z" },
  ];

  const ultimas = mostRecent(piezas, 2);

  assert.deepEqual(
    ultimas.map((one) => one.id),
    ["solo-publicada", "solo-programada"],
  );
});

test("no muta ni reordena el array de entrada", () => {
  // La pantalla de la cola depende del orden que devuelve listPosts; esta
  // función tiene que trabajar sobre una copia, nunca sobre el original.
  const piezas = [
    { id: "a", scheduledAt: "2026-01-01T00:00:00.000Z", publishedAt: null },
    { id: "b", scheduledAt: "2026-03-01T00:00:00.000Z", publishedAt: null },
  ];
  const copia = [...piezas];

  mostRecent(piezas, 1);

  assert.deepEqual(piezas, copia);
});
