import assert from "node:assert/strict";
import { test } from "node:test";

import { matchByPosition } from "./angulos-vuelta.ts";

test("cuando vuelven todos, se casan todos", () => {
  assert.deepEqual(matchByPosition([1, 2, 3], ["a", "b", "c"]), { casados: 3, sobran: 0 });
});

test("si vuelven de menos, se casan los que hay y se dice cuántos faltan", () => {
  // No se corren posiciones: casar el tercero pedido con el segundo devuelto es
  // como acaba un titular en el sitio del botón.
  assert.deepEqual(matchByPosition([1, 2, 3], ["a", "b"]), { casados: 2, sobran: 1 });
});

test("si vuelven de más, se ignoran los sobrantes", () => {
  assert.deepEqual(matchByPosition([1, 2], ["a", "b", "c"]), { casados: 2, sobran: 0 });
});

test("sin vuelta no se casa nada, y se nota", () => {
  // Este es el caso que anoche se contaba como éxito: cero guardados y un
  // resumen diciendo que había ido bien.
  assert.deepEqual(matchByPosition([1, 2], []), { casados: 0, sobran: 2 });
});
