import assert from "node:assert/strict";
import { test } from "node:test";

import { code, conversionNote, convert, needsConversion, pickRate, sumConverted } from "./fx.ts";
import type { Rate } from "./fx.ts";

const rate = (day: string, value: number, exact = true): Rate => ({
  day,
  from: "USD",
  to: "CLP",
  rate: value,
  exact,
});

const RATES = [rate("2026-08-01", 900), rate("2026-08-03", 930)];

/* ------------------------------ Lo básico ----------------------------------- */

test("los códigos se normalizan: vienen en minúsculas y con espacios", () => {
  assert.equal(code(" usd "), "USD");
  assert.equal(code(null), "");
});

test("la misma moneda no se cambia", () => {
  assert.equal(needsConversion("CLP", "clp"), false);
  assert.equal(needsConversion("USD", "CLP"), true);
});

test("sin moneda no se inventa una conversión", () => {
  assert.equal(needsConversion("", "CLP"), false);
});

/* -------------------------------- El cambio --------------------------------- */

test("el del día exacto es el que manda", () => {
  const found = pickRate(RATES, "2026-08-03", "USD", "CLP");

  assert.equal(found?.rate, 930);
  assert.equal(found?.exact, true);
});

/*
 * Nunca uno posterior: el cambio de mañana no existía el día que se gastó, y
 * usarlo convierte un informe cerrado en algo que se mueve solo.
 */
test("sin el del día se coge el anterior, nunca el siguiente", () => {
  const found = pickRate(RATES, "2026-08-02", "USD", "CLP");

  assert.equal(found?.rate, 900);
  assert.equal(found?.exact, false);
});

test("de un día anterior a todos se coge el más antiguo, avisando", () => {
  const found = pickRate(RATES, "2026-07-01", "USD", "CLP");

  assert.equal(found?.rate, 900);
  assert.equal(found?.exact, false);
});

test("un par que no está devuelve nada, no el de otra moneda", () => {
  assert.equal(pickRate(RATES, "2026-08-03", "EUR", "CLP"), null);
});

/* ------------------------------- La conversión ------------------------------ */

test("se cambia con el del día", () => {
  const done = convert(23.77, "2026-08-03", "USD", "CLP", RATES);

  assert.equal(Math.round(done.amount), 22106);
  assert.equal(done.problem, "");
  assert.equal(done.exact, true);
});

test("la misma moneda pasa tal cual", () => {
  assert.deepEqual(convert(1500, "2026-08-03", "CLP", "CLP", RATES), {
    amount: 1500,
    problem: "",
    exact: true,
  });
});

/*
 * La decisión que importa de todo el módulo: devolver el importe sin cambiar
 * cuando falla es exactamente lo que hacía antes —sumar dólares a pesos— con la
 * ventaja de parecer que funciona.
 */
test("lo que no se puede cambiar no se devuelve tal cual", () => {
  const done = convert(23.77, "2026-08-03", "EUR", "CLP", RATES);

  assert.equal(done.amount, 0);
  assert.match(done.problem, /No hay cambio de EUR a CLP/);
});

test("un cambio a cero se trata como que no lo hay", () => {
  const roto = [{ day: "2026-08-03", from: "USD", to: "CLP", rate: 0, exact: true }];

  assert.match(convert(10, "2026-08-03", "USD", "CLP", roto).problem, /No hay cambio/);
});

/* --------------------------------- La suma ---------------------------------- */

test("se suman monedas distintas al cambio de cada día", () => {
  const { total, missing } = sumConverted(
    [
      { amount: 10, day: "2026-08-01", currency: "USD" },
      { amount: 5_000, day: "2026-08-01", currency: "CLP" },
    ],
    "CLP",
    RATES,
  );

  assert.equal(total, 14_000);
  assert.deepEqual(missing, []);
});

/*
 * Un total al que le faltan tres días de gasto tiene el mismo aspecto que uno
 * completo, y la diferencia son cientos de dólares en el beneficio.
 */
test("lo que no se pudo cambiar se cuenta aparte, no como cero", () => {
  const { total, missing } = sumConverted(
    [
      { amount: 10, day: "2026-08-01", currency: "USD" },
      { amount: 7, day: "2026-08-01", currency: "EUR" },
    ],
    "CLP",
    RATES,
  );

  assert.equal(total, 9_000);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].currency, "EUR");
});

test("se marca cuando algún día usó un cambio que no era el suyo", () => {
  const { approx } = sumConverted(
    [{ amount: 10, day: "2026-08-02", currency: "USD" }],
    "CLP",
    RATES,
  );

  assert.equal(approx, true);
});

test("todo exacto no se marca como aproximado", () => {
  const { approx } = sumConverted(
    [{ amount: 10, day: "2026-08-03", currency: "USD" }],
    "CLP",
    RATES,
  );

  assert.equal(approx, false);
});

test("una lista vacía da cero sin quejarse", () => {
  assert.deepEqual(sumConverted([], "CLP", RATES), { total: 0, missing: [], approx: false });
});

/* --------------------------------- El aviso --------------------------------- */

test("lo que falta se cuenta con su moneda", () => {
  const nota = conversionNote({ missing: [{ currency: "EUR", amount: 7 }], approx: false });

  assert.match(nota, /EUR/);
  assert.match(nota, /más bajo del real/);
});

test("lo aproximado se dice por qué", () => {
  assert.match(conversionNote({ missing: [], approx: true }), /no da histórico/);
});

test("sin nada que contar no se dice nada", () => {
  assert.equal(conversionNote({ missing: [], approx: false }), "");
});
