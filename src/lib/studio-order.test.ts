import assert from "node:assert/strict";
import { test } from "node:test";
import { STEP, initialPositions, move, nextPosition, sorted } from "./studio-order.ts";

const lista = (positions: number[]) =>
  positions.map((position, index) => ({ id: String.fromCharCode(97 + index), position }));

test("las posiciones se reparten con hueco entre ellas", () => {
  assert.deepEqual(initialPositions(3), [20, 40, 60]);
});

test("mover una pieza escribe solo esa", () => {
  // Renumerar todas en cada arrastre serían treinta escrituras para un gesto
  // que se repite cada pocos segundos.
  const { changes, renumbered } = move(lista([20, 40, 60]), "c", 0);

  assert.equal(renumbered, false);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "c");
  assert.ok(changes[0].position < 20, "queda antes que la primera");
});

test("al soltarla entre dos, cae en medio", () => {
  const { changes } = move(lista([20, 40, 60]), "a", 1);

  assert.equal(changes[0].position, 50, "entre la de 40 y la de 60");
});

test("al final se pone detrás de todas", () => {
  const { changes } = move(lista([20, 40, 60]), "a", 2);

  assert.ok(changes[0].position > 60);
});

test("cuando no cabe ningún número en medio, se renumera todo", () => {
  /*
   * Pasa después de muchos movimientos en el mismo punto. Es el único caso que
   * cuesta varias escrituras — y no detectarlo dejaría dos piezas con la misma
   * posición y un orden que cambia solo.
   */
  // Dos piezas pegadas —20 y 21— y una tercera que hay que meter entre ellas.
  const { changes, renumbered } = move(lista([20, 21, 60]), "c", 1);

  assert.equal(renumbered, true);
  assert.deepEqual(
    changes.map((item) => item.id),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    changes.map((item) => item.position),
    [20, 40, 60],
  );
});

test("mover algo que no está no cambia nada", () => {
  assert.deepEqual(move(lista([20]), "zz", 0), { changes: [], renumbered: false });
});

test("una pieza nueva va detrás de todas", () => {
  assert.equal(nextPosition(lista([20, 40])), 60);
  assert.equal(nextPosition([]), STEP);
});

test("la lista se pinta por posición, no por cuándo se creó", () => {
  const desordenada = [
    { id: "c", position: 60 },
    { id: "a", position: 20 },
    { id: "b", position: 40 },
  ];

  assert.deepEqual(
    sorted(desordenada).map((item) => item.id),
    ["a", "b", "c"],
  );
});
