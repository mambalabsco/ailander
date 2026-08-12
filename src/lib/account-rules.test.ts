import assert from "node:assert/strict";
import { test } from "node:test";
import { emailProblem, passwordProblem } from "./account-rules.ts";

test("la contraseña corta se rechaza con el número que dice config.toml", () => {
  assert.match(passwordProblem("1234567") ?? "", /8/);
});

test("ocho caracteres justos valen", () => {
  assert.equal(passwordProblem("12345678"), null);
});

test("la contraseña vacía no es «corta», es que falta", () => {
  // El mensaje importa: «debe tener 8 caracteres» ante un campo vacío hace
  // pensar que se envió algo y no era suficiente.
  assert.match(passwordProblem("") ?? "", /escribe/i);
});

test("los espacios de los extremos no cuentan como longitud", () => {
  assert.notEqual(passwordProblem("  1234  "), null);
});

test("un correo sin arroba no vale", () => {
  assert.notEqual(emailProblem("pedro.ejemplo.com", "pedro@ejemplo.com"), null);
});

test("proponer el correo que ya tiene no es un cambio", () => {
  assert.notEqual(emailProblem("pedro@ejemplo.com", "pedro@ejemplo.com"), null);
});

test("el mismo correo con otras mayúsculas tampoco es un cambio", () => {
  // Supabase guarda el correo en minúsculas; sin normalizar, «Pedro@…»
  // parecería un cambio, se propondría, y al confirmar no cambiaría nada.
  assert.notEqual(emailProblem("Pedro@Ejemplo.com", "pedro@ejemplo.com"), null);
});

test("un correo nuevo y bien escrito pasa", () => {
  assert.equal(emailProblem("nuevo@ejemplo.com", "pedro@ejemplo.com"), null);
});
