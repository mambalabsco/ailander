import { test } from "node:test";
import assert from "node:assert/strict";

import {
  contributionMargin,
  judge,
  sortByAction,
  summarize,
  type Verdict,
} from "./campaign-verdict.ts";

/**
 * La prueba que da sentido a todo el archivo es la primera: **el mismo ROAS de 2
 * es bueno con un margen del 70% y ruinoso con uno del 30%.** Si alguien
 * sustituye el ROAS de equilibrio por un umbral fijo, esa prueba falla.
 */

test("el mismo ROAS es bueno o ruinoso según el margen de la tienda", () => {
  const alto = judge({ spend: 100, revenue: 200, orders: 10, contributionMargin: 0.7 });
  const bajo = judge({ spend: 100, revenue: 200, orders: 10, contributionMargin: 0.3 });

  assert.equal(alto.roas, 2);
  assert.equal(bajo.roas, 2);

  // Con 70% de margen el equilibrio está en 1,43: un ROAS de 2 lo supera de sobra.
  assert.equal(alto.verdict, "escalar");
  // Con 30% el equilibrio está en 3,33: un ROAS de 2 pierde dinero en cada venta.
  assert.equal(bajo.verdict, "cortar");
});

test("el ROAS de equilibrio es la inversa del margen", () => {
  assert.equal(
    judge({ spend: 100, revenue: 200, orders: 10, contributionMargin: 0.5 }).breakevenRoas,
    2,
  );
  assert.equal(
    judge({ spend: 100, revenue: 200, orders: 10, contributionMargin: 0.25 }).breakevenRoas,
    4,
  );
});

test("la contribución está en dinero, no en veces", () => {
  // 1000 vendidos al 40% de margen dejan 400; menos 200 de publicidad, 200.
  const result = judge({ spend: 200, revenue: 1000, orders: 20, contributionMargin: 0.4 });

  assert.equal(result.contribution, 200);
});

test("una campaña que gasta y no vende tiene contribución negativa", () => {
  const result = judge({ spend: 300, revenue: 0, orders: 0, contributionMargin: 0.5 });

  assert.equal(result.contribution, -300);
  assert.equal(result.verdict, "cortar");
});

/* --------------------------- Las cuatro bandas ----------------------------- */

test("las bandas se miden contra el equilibrio, no contra un número fijo", () => {
  // Margen del 50%: el equilibrio es un ROAS de 2.
  const at = (roas: number) =>
    judge({ spend: 100, revenue: roas * 100, orders: 10, contributionMargin: 0.5 }).verdict;

  assert.equal(at(2.9), "escalar"); // 1,45× el equilibrio
  assert.equal(at(2.8), "escalar"); // 1,40× justo
  assert.equal(at(2.4), "mantener"); // 1,20×
  assert.equal(at(2.3), "mantener"); // 1,15× justo
  assert.equal(at(2.1), "vigilar"); // 1,05×
  assert.equal(at(2.0), "vigilar"); // exactamente en el equilibrio
  assert.equal(at(1.9), "cortar"); // por debajo
});

/* ------------------------------- Sin datos --------------------------------- */

test("pocos pedidos y poco gasto es «sin datos», no un veredicto", () => {
  /*
   * Es la prueba que impide escalar un accidente. Dos ventas con un ROAS de 6 no
   * es una campaña ganadora: es una campaña sin datos.
   */
  const result = judge({ spend: 20, revenue: 120, orders: 2, contributionMargin: 0.5 });

  assert.equal(result.verdict, "sin-datos");
  assert.equal(result.roas, 6);
});

test("con gasto suficiente sí se juzga, aunque haya pocos pedidos", () => {
  // Una campaña que ha gastado de sobra y no vende no se queda en «sin datos»
  // esperando pedidos que no van a llegar.
  const result = judge({ spend: 300, revenue: 0, orders: 0, contributionMargin: 0.5 }, 50);

  assert.equal(result.verdict, "cortar");
});

test("con cinco pedidos ya se juzga aunque el gasto sea bajo", () => {
  const result = judge({ spend: 20, revenue: 200, orders: 5, contributionMargin: 0.5 });

  assert.equal(result.verdict, "escalar");
});

test("sin gasto no hay nada que juzgar", () => {
  const result = judge({ spend: 0, revenue: 0, orders: 0, contributionMargin: 0.5 });

  assert.equal(result.verdict, "sin-datos");
  assert.equal(result.roas, null);
});

test("sin margen conocido no se inventa un veredicto", () => {
  const result = judge({ spend: 500, revenue: 2000, orders: 40, contributionMargin: null });

  assert.equal(result.verdict, "sin-datos");
  assert.equal(result.breakevenRoas, null);
  assert.match(result.reason, /faltan costos/);
});

/* ----------------------- El margen de contribución ------------------------- */

test("el margen sale del beneficio bruto sobre los ingresos", () => {
  assert.equal(contributionMargin(1000, 400), 0.4);
});

test("un margen negativo no es un margen: se vende por debajo de coste", () => {
  // Ahí ninguna campaña puede ser rentable, y no hay equilibrio que alcanzar.
  assert.equal(contributionMargin(1000, -50), null);
  assert.equal(contributionMargin(1000, 0), null);
  assert.equal(contributionMargin(0, 0), null);
});

/* --------------------------------- Orden ---------------------------------- */

test("primero lo que hay que tocar, y dentro por gasto", () => {
  const rows: { verdict: Verdict; spend: number; name: string }[] = [
    { verdict: "mantener", spend: 900, name: "a" },
    { verdict: "cortar", spend: 100, name: "b" },
    { verdict: "cortar", spend: 800, name: "c" },
    { verdict: "escalar", spend: 500, name: "d" },
    { verdict: "sin-datos", spend: 10, name: "e" },
    { verdict: "vigilar", spend: 200, name: "f" },
  ];

  assert.deepEqual(
    sortByAction(rows).map((row) => row.name),
    // Cortar (por gasto), vigilar, escalar, mantener, sin datos.
    ["c", "b", "f", "d", "a", "e"],
  );
});

/* -------------------------------- Resumen --------------------------------- */

test("el resumen dice cuánto dinero hay en cada veredicto", () => {
  const summary = summarize([
    { verdict: "cortar" as Verdict, spend: 400, contribution: -300 },
    { verdict: "cortar" as Verdict, spend: 800, contribution: -500 },
    { verdict: "escalar" as Verdict, spend: 1000, contribution: 900 },
  ]);

  assert.equal(summary.cortar.count, 2);
  assert.equal(summary.cortar.spend, 1200);
  assert.equal(summary.cortar.contribution, -800);
  assert.equal(summary.escalar.count, 1);
  assert.equal(summary.mantener.count, 0);
});
