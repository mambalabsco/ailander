import assert from "node:assert/strict";
import { test } from "node:test";

import { validarPlan } from "./plan-automatico.ts";

const DISPONIBLE = { angulos: ["a1", "a2"], anatomias: ["m1"] };

const PLAN = {
  fuente: "material",
  id: "m1",
  nivel: "ampliado",
  etapa: "MOFU",
  cuantos: 6,
  porQue: "El material rinde y todavía no se ha probado con público de al lado",
};

test("un plan que apunta a algo que existe se acepta entero", () => {
  const plan = validarPlan(PLAN, DISPONIBLE);

  assert.equal(plan.fuente, "material");
  assert.equal(plan.id, "m1");
  assert.equal(plan.nivel, "ampliado");
  assert.equal(plan.etapa, "MOFU");
  assert.equal(plan.cuantos, 6);
});

test("una anatomía inventada da error y NO cae al ángulo por defecto", () => {
  // Es el fallo que este módulo existe para impedir: una tanda correcta,
  // cobrada, y con la sensación de que salió del material que se quería.
  assert.throws(() => validarPlan({ ...PLAN, id: "no-existe" }, DISPONIBLE), /no existe/i);
});

test("un ángulo inventado también", () => {
  assert.throws(
    () => validarPlan({ ...PLAN, fuente: "angulo", id: "a9", nivel: "" }, DISPONIBLE),
    /no existe/i,
  );
});

test("un ángulo que sí existe se acepta, y sin nivel", () => {
  const plan = validarPlan({ ...PLAN, fuente: "angulo", id: "a2", nivel: "" }, DISPONIBLE);

  assert.equal(plan.fuente, "angulo");
  assert.equal(plan.nivel, "");
});

test("material sin nivel es un plan incompleto, no un nivel por defecto", () => {
  // Poner uno a dedo aquí sería decidir por el modelo justo lo que se le pidió.
  assert.throws(() => validarPlan({ ...PLAN, nivel: "" }, DISPONIBLE), /cercanía/i);
});

test("un nivel que no es ninguno de los tres se rechaza", () => {
  assert.throws(() => validarPlan({ ...PLAN, nivel: "parecidillo" }, DISPONIBLE), /cercanía/i);
});

test("una etapa desconocida cae en TOFU en vez de romper la tanda", () => {
  // Aquí sí hay valor por defecto sensato: la etapa no cambia de dónde sale la
  // idea, solo por dónde entra, y el modelo devuelve las tres etapas igualmente.
  assert.equal(validarPlan({ ...PLAN, etapa: "MEDIO" }, DISPONIBLE).etapa, "TOFU");
});

test("cuántos se acota a lo que la pantalla permite", () => {
  assert.equal(validarPlan({ ...PLAN, cuantos: 400 }, DISPONIBLE).cuantos, 20);
  assert.equal(validarPlan({ ...PLAN, cuantos: 0.4 }, DISPONIBLE).cuantos, 1);
});

test("un cero o un hueco caen en el número de siempre, no en un anuncio suelto", () => {
  // Cero significa «no lo dijo», y una tanda de un anuncio no es lo que nadie
  // quería: es peor que el valor normal. Por eso 0 y ausente van al mismo sitio.
  assert.equal(validarPlan({ ...PLAN, cuantos: 0 }, DISPONIBLE).cuantos, 5);
  assert.equal(validarPlan({ ...PLAN, cuantos: undefined }, DISPONIBLE).cuantos, 5);
});

test("sin motivo escrito, el plan se rechaza", () => {
  // El motivo es lo que separa esto de una caja negra: si no viene, el resumen
  // no puede decir qué eligió y por qué.
  assert.throws(() => validarPlan({ ...PLAN, porQue: "  " }, DISPONIBLE), /por qué/i);
});

test("una respuesta vacía no se convierte en un plan cualquiera", () => {
  assert.throws(() => validarPlan(null, DISPONIBLE), /no existe/i);
});
