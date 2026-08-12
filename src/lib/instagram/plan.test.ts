import assert from "node:assert/strict";
import { test } from "node:test";

import { countsFor, recentSummary, weekPlan } from "./plan.ts";

test("lo anterior se resume, no se manda entero", () => {
  /*
   * Con veinte pies completos el contexto se dispara, y lo que hay que evitar
   * —repetir el gancho o la misma foto— cabe en dos líneas por pieza.
   */
  const resumen = recentSummary([
    { format: "reel", scene: "Una mujer en el coche", first: "El zumbido no se va", showsProduct: false },
    { format: "feed", scene: "El bote en la mesilla", first: "Una cápsula antes de dormir", showsProduct: true },
  ]);

  assert.ok(resumen.includes("El zumbido no se va"));
  assert.ok(resumen.includes("Una mujer en el coche"));
  assert.ok(resumen.includes("con producto"), "se dice cuál llevaba producto");
  assert.ok(resumen.includes("no repetir"));
});

test("sin historial no se manda una sección vacía", () => {
  // Un «lo que ya se publicó» sin nada debajo invita a inventarse un pasado.
  assert.equal(recentSummary([]), "");
});

test("solo las últimas: más atrás ya no es repetirse, es tener una línea", () => {
  const muchas = Array.from({ length: 40 }, (_, i) => ({
    format: "feed",
    scene: `escena ${i}`,
    first: `gancho ${i}`,
    showsProduct: false,
  }));

  const resumen = recentSummary(muchas, 15);

  assert.ok(resumen.includes("gancho 14"));
  assert.ok(!resumen.includes("gancho 15"));
});

test("la semana se reparte, no se sortea", () => {
  /*
   * Cinco reels seguidos y luego cuatro días en blanco parece una cuenta
   * abandonada aunque tenga el mismo número de piezas. El ritmo se decide
   * antes.
   */
  const plan = weekPlan(8);

  assert.equal(plan.length, 8);
  assert.equal(new Set(plan).size, 4, "los cuatro formatos entran, historias incluidas");
  assert.ok(!plan.some((one, i) => i > 0 && one === plan[i - 1]), "nunca dos iguales seguidos");
});

test("dos semanas seguidas no empiezan igual", () => {
  /*
   * Con siete días y tres formatos, la segunda semana entra desplazada. Con un
   * número de días múltiplo del ciclo caería en el mismo sitio — es una
   * limitación real del reparto, y por eso se prueba con la semana, que es el
   * uso, y no con tres días, que no lo es.
   */
  const primera = weekPlan(7, 0);
  const segunda = weekPlan(7, 7);

  assert.notEqual(primera[0], segunda[0]);
});

test("el plan se traduce a cuántas pedir de cada formato", () => {
  const cuentas = countsFor(weekPlan(7));

  assert.equal(cuentas.reduce((total, one) => total + one.count, 0), 7);
  // En el orden del catálogo: la pantalla enseña siempre lo mismo en el mismo
  // sitio, aunque el plan empiece por otro día.
  assert.deepEqual(cuentas.map((one) => one.format), ["feed", "carrusel", "reel", "historia"]);
});
