import { test } from "node:test";
import assert from "node:assert/strict";

import {
  daysIn,
  describeRange,
  previousRange,
  resolveRange,
  todayIn,
} from "./date-range.ts";

/**
 * Un error de un día en un rango no se ve: las cifras siguen pareciendo
 * razonables y todas las comparaciones quedan desplazadas. Por eso se prueba
 * cada preajuste contra una fecha fija.
 *
 * La fecha de referencia es el 29 de julio de 2026, un miércoles.
 */
const HOY = "2026-07-29";

test("hoy y ayer son un solo día", () => {
  assert.deepEqual(resolveRange("hoy", HOY), { from: HOY, to: HOY });
  assert.deepEqual(resolveRange("ayer", HOY), { from: "2026-07-28", to: "2026-07-28" });
});

test("«últimos 7 días» incluye hoy, y son siete", () => {
  const range = resolveRange("7d", HOY);

  assert.deepEqual(range, { from: "2026-07-23", to: "2026-07-29" });
  assert.equal(daysIn(range), 7);
});

test("los otros preajustes de días también incluyen hoy", () => {
  assert.equal(daysIn(resolveRange("30d", HOY)), 30);
  assert.equal(daysIn(resolveRange("90d", HOY)), 90);
});

test("«este mes» va del día 1 a hoy", () => {
  assert.deepEqual(resolveRange("este-mes", HOY), { from: "2026-07-01", to: "2026-07-29" });
});

test("«mes pasado» es el mes completo, con su último día real", () => {
  assert.deepEqual(resolveRange("mes-pasado", HOY), { from: "2026-06-01", to: "2026-06-30" });
  // Marzo mirando desde abril: 31 días, no 30.
  assert.deepEqual(resolveRange("mes-pasado", "2026-04-15"), {
    from: "2026-03-01",
    to: "2026-03-31",
  });
  // Y febrero de un año no bisiesto acaba el 28.
  assert.deepEqual(resolveRange("mes-pasado", "2026-03-10"), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
});

test("«este año» arranca el 1 de enero", () => {
  assert.deepEqual(resolveRange("este-año", HOY), { from: "2026-01-01", to: HOY });
});

test("un rango personalizado al revés se da la vuelta", () => {
  assert.deepEqual(
    resolveRange("personalizado", HOY, { from: "2026-07-20", to: "2026-07-10" }),
    { from: "2026-07-10", to: "2026-07-20" },
  );
});

test("un rango personalizado con basura cae en los últimos 30 días", () => {
  const range = resolveRange("personalizado", HOY, { from: "ayer", to: "" });

  assert.equal(daysIn(range), 30);
  assert.equal(range.to, HOY);
});

/* ------------------------- El periodo de comparación ----------------------- */

test("el periodo anterior es igual de largo y pegado por detrás", () => {
  const range = resolveRange("7d", HOY);
  const previous = previousRange(range, "7d");

  assert.deepEqual(previous, { from: "2026-07-16", to: "2026-07-22" });
  assert.equal(daysIn(previous), daysIn(range));
});

test("«mes pasado» se compara con el mes anterior completo", () => {
  const range = resolveRange("mes-pasado", HOY); // junio
  const previous = previousRange(range, "mes-pasado");

  assert.deepEqual(previous, { from: "2026-05-01", to: "2026-05-31" });
});

test("«este mes» se compara con los mismos días del mes pasado", () => {
  // Del 1 al 29 de julio contra del 1 al 29 de junio, no contra junio entero.
  const previous = previousRange(resolveRange("este-mes", HOY), "este-mes");

  assert.deepEqual(previous, { from: "2026-06-01", to: "2026-06-29" });
});

test("«este mes» no se sale del mes anterior si es más corto", () => {
  // Del 1 al 31 de marzo contra febrero, que solo tiene 28 días.
  const previous = previousRange(resolveRange("este-mes", "2026-03-31"), "este-mes");

  assert.deepEqual(previous, { from: "2026-02-01", to: "2026-02-28" });
});

test("un rango de un día se compara con el día anterior", () => {
  assert.deepEqual(previousRange({ from: HOY, to: HOY }), {
    from: "2026-07-28",
    to: "2026-07-28",
  });
});

/* --------------------------------- Fechas --------------------------------- */

test("hoy depende de la zona horaria de la tienda", () => {
  // 03:00 UTC del 29 son las 21:00 del 28 en Ciudad de México.
  const instant = new Date("2026-07-29T03:00:00Z");

  assert.equal(todayIn("America/Mexico_City", instant), "2026-07-28");
  assert.equal(todayIn("America/Santiago", instant), "2026-07-28");
  assert.equal(todayIn("Europe/Madrid", instant), "2026-07-29");
});

test("una zona horaria inválida cae a UTC en vez de romper", () => {
  assert.equal(todayIn("No/Existe", new Date("2026-07-29T03:00:00Z")), "2026-07-29");
});

test("un rango de un solo día no se escribe dos veces", () => {
  assert.ok(!describeRange({ from: HOY, to: HOY }).includes("–"));
  assert.ok(describeRange({ from: "2026-07-01", to: HOY }).includes("–"));
});

test("un rango inválido tiene cero días, no negativos", () => {
  assert.equal(daysIn({ from: "2026-07-10", to: "2026-07-01" }), 0);
  assert.equal(daysIn({ from: "no", to: "válido" }), 0);
});
