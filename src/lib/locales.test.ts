import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COUNTRIES,
  CURRENCIES,
  LANGUAGES,
  currencyMatchesCountry,
  findCountry,
  fold,
  search,
} from "./locales.ts";

/* -------------------------------- El bug ----------------------------------- */

test("el caso que motivó todo: Chile no es euros", () => {
  /*
   * El formulario tenía texto libre y en pantalla había un mercado chileno con
   * moneda EUR. Nada avisaba: cualquier cadena de tres letras vale para un campo
   * de texto, y la moneda del mercado rotula los precios de los productos.
   */
  assert.equal(findCountry("Chile")?.currency, "CLP");
  assert.equal(currencyMatchesCountry("Chile", "EUR"), false);
  assert.equal(currencyMatchesCountry("Chile", "CLP"), true);
});

test("una combinación rara avisa pero no es siempre un error", () => {
  /*
   * La tienda mexicana de este proyecto liquida en dólares a propósito. Por eso
   * se avisa en vez de bloquear — lo que no puede pasar es que nadie lo mire.
   */
  assert.equal(currencyMatchesCountry("México", "USD"), false);
  assert.equal(currencyMatchesCountry("México", "MXN"), true);
});

test("sin país o sin moneda no se inventa un aviso", () => {
  assert.equal(currencyMatchesCountry("", "EUR"), true);
  assert.equal(currencyMatchesCountry("Chile", ""), true);
  assert.equal(currencyMatchesCountry("Wakanda", "EUR"), true);
});

/* ------------------------------- La búsqueda ------------------------------- */

test("se puede buscar sin acentos, que es como se escribe rápido", () => {
  // Sin esto, «mexico» no encuentra «México» — y son los mercados del proyecto.
  assert.equal(search(COUNTRIES, "mexico")[0].code, "MX");
  assert.equal(search(COUNTRIES, "peru")[0].code, "PE");
  assert.equal(search(COUNTRIES, "espana")[0].code, "ES");
});

test("también por código, para quien lo sabe", () => {
  assert.equal(search(COUNTRIES, "cl")[0].code, "CL");
  assert.equal(search(COUNTRIES, "MX")[0].code, "MX");
});

test("lo que empieza por lo escrito sale primero", () => {
  /*
   * Buscando «co», Colombia tiene que salir antes que Costa Rica y que México
   * —que contiene «co» en medio—. Sin el orden, el primero de la lista es el
   * que más arriba estaba, no el más probable.
   */
  assert.equal(search(COUNTRIES, "co")[0].code, "CO");
});

test("una búsqueda vacía devuelve todo, sin reordenar", () => {
  assert.equal(search(COUNTRIES, "").length, COUNTRIES.length);
  assert.equal(search(COUNTRIES, "   ")[0].code, "CL");
});

test("algo que no existe devuelve una lista vacía", () => {
  assert.deepEqual(search(COUNTRIES, "wakanda"), []);
});

test("fold quita acentos, mayúsculas y también la eñe", () => {
  // La eñe también, y es lo que se quiere: quien busca escribe «espana».
  assert.equal(fold("México"), "mexico");
  assert.equal(fold("  ESPAÑA "), "espana");
});

/* ------------------------------- Las listas -------------------------------- */

test("los mercados del proyecto salen primero", () => {
  // Chile y México arriba ahorra escribir en casi todos los casos.
  assert.deepEqual(
    COUNTRIES.slice(0, 3).map((country) => country.code),
    ["CL", "MX", "ES"],
  );
});

test("no hay códigos de país repetidos", () => {
  const codes = COUNTRIES.map((country) => country.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("cada país tiene una moneda que está en la lista de monedas", () => {
  /*
   * Si un país trae una moneda que no está, el desplegable se rellenaría con un
   * valor que no se puede volver a elegir.
   */
  const known = new Set(CURRENCIES.map((currency) => currency.code));

  for (const country of COUNTRIES) {
    assert.ok(known.has(country.currency), `${country.name} usa ${country.currency}, que falta`);
  }
});

test("cada país tiene un idioma que está en la lista de idiomas", () => {
  const known = new Set(LANGUAGES.map((language) => language.code));

  for (const country of COUNTRIES) {
    assert.ok(known.has(country.language), `${country.name} habla ${country.language}, que falta`);
  }
});

test("los códigos de país son de dos letras y los de moneda de tres", () => {
  for (const country of COUNTRIES) {
    assert.match(country.code, /^[A-Z]{2}$/, `${country.name} tiene un código raro`);
    assert.match(country.currency, /^[A-Z]{3}$/, `${country.name} tiene una moneda rara`);
  }
});
