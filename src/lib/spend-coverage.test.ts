import assert from "node:assert/strict";
import { test } from "node:test";

import { coverage, isClean, matches } from "./spend-coverage.ts";

const mexico = { storeId: "mx", storeName: "Naturox México", include: ["_MX_"], exclude: [] };
const chile = { storeId: "cl", storeName: "Naturox Chile", include: ["_CL_"], exclude: [] };

/* ------------------------------ El filtro ---------------------------------- */

test("sin filtros entra todo", () => {
  assert.equal(matches("lo que sea", [], []), true);
});

test("incluir primero, excluir después", () => {
  // «Todo lo de México menos la vieja», con dos reglas en vez de veinte.
  assert.equal(matches("220326_MX_NATUROX", ["_MX_"], ["vieja"]), true);
  assert.equal(matches("220326_MX_NATUROX vieja", ["_MX_"], ["vieja"]), false);
});

test("por subcadena y sin distinguir mayúsculas", () => {
  // Los nombres reales llevan sufijos: pedir la cadena exacta obligaría a tocar
  // el filtro cada vez que alguien duplica una campaña.
  assert.equal(matches("220326_mx_naturox - Copia", ["_MX_"], []), true);
});

test("los espacios sueltos de un filtro no lo convierten en «incluye todo»", () => {
  assert.equal(matches("cualquiera", ["  "], []), true);
  assert.equal(matches("cualquiera", ["  ", "_MX_"], []), false);
});

/* ---------------------------- El reparto ----------------------------------- */

test("cada campaña va a su tienda", () => {
  const result = coverage({
    campaigns: [
      { name: "220326_MX_NATUROX", spend: 100 },
      { name: "220326_CL_NATUROX", spend: 60 },
    ],
    stores: [mexico, chile],
  });

  assert.equal(result.total, 160);
  assert.deepEqual(
    result.byStore.map((store) => [store.storeId, store.spend]),
    [
      ["mx", 100],
      ["cl", 60],
    ],
  );
  assert.equal(isClean(result), true);
});

/*
 * El primero de los dos fallos silenciosos: una campaña nueva que no encaja en
 * el filtro de ninguna tienda desaparece de todos los informes, y el beneficio
 * sale más alto que el real.
 */
test("el gasto que no encaja en ninguna tienda se señala", () => {
  const result = coverage({
    campaigns: [
      { name: "220326_MX_NATUROX", spend: 100 },
      { name: "PRUEBA SCULPT nueva", spend: 45 },
    ],
    stores: [mexico, chile],
  });

  assert.equal(result.unassigned, 45);
  assert.deepEqual(result.orphans.map((item) => item.name), ["PRUEBA SCULPT nueva"]);
  assert.equal(isClean(result), false);
});

/*
 * El segundo: si una tienda incluye «naturox» y otra «_MX_», la campaña
 * «Naturox MX» se resta del beneficio de las dos y la suma no cuadra con la
 * factura de Meta.
 */
test("el gasto que encaja en dos tiendas se señala", () => {
  const amplio = { storeId: "todo", storeName: "Naturox", include: ["naturox"], exclude: [] };

  const result = coverage({
    campaigns: [{ name: "220326_MX_NATUROX", spend: 100 }],
    stores: [mexico, amplio],
  });

  assert.equal(result.shared.length, 1);
  assert.deepEqual(result.shared[0].stores.map((store) => store.storeId), ["mx", "todo"]);

  // Se cuenta 200 donde debería contar 100: sobran 100.
  assert.equal(result.doubled, 100);
  assert.equal(isClean(result), false);
});

test("en tres tiendas sobra el doble, no el triple", () => {
  const stores = ["a", "b", "c"].map((id) => ({
    storeId: id,
    storeName: id,
    include: ["naturox"],
    exclude: [],
  }));

  const result = coverage({ campaigns: [{ name: "NATUROX", spend: 100 }], stores });

  // Se cuenta 300 donde debería contar 100.
  assert.equal(result.doubled, 200);
});

/*
 * Una tienda sin filtros se lleva **todas** las campañas de la cuenta.
 *
 * Es el error de configuración más fácil de cometer y el más caro: la de
 * México se cuenta dos veces, y la de Chile se cuenta una sola pero en la
 * tienda equivocada. Lo primero se detecta; lo segundo no puede detectarlo
 * nadie desde aquí —no hay forma de saber de qué tienda es una campaña salvo
 * por su nombre—, y por eso lo que se enseña es a qué tienda va cada una.
 */
test("una tienda sin filtros se lleva todo, y eso pisa a las demás", () => {
  const sinFiltro = { storeId: "todo", storeName: "Todo", include: [], exclude: [] };

  const result = coverage({
    campaigns: [
      { name: "220326_MX_NATUROX", spend: 100 },
      { name: "220326_CL_NATUROX", spend: 60 },
    ],
    stores: [mexico, sinFiltro],
  });

  // La de México encaja en las dos; la de Chile solo en la que no filtra.
  assert.deepEqual(result.shared.map((item) => item.name), ["220326_MX_NATUROX"]);
  assert.equal(result.doubled, 100);

  // Y «Todo» acaba cargando con los 160, que es lo que delata la mala
  // configuración al mirarlo.
  assert.equal(result.byStore.find((store) => store.storeId === "todo")?.spend, 160);
  assert.equal(isClean(result), false);
});

test("lo caro sale primero, que es lo que hay que arreglar antes", () => {
  const result = coverage({
    campaigns: [
      { name: "huérfana barata", spend: 5 },
      { name: "huérfana cara", spend: 500 },
    ],
    stores: [mexico],
  });

  assert.deepEqual(result.orphans.map((item) => item.spend), [500, 5]);
});

test("sin tiendas, todo el gasto queda sin dueño", () => {
  const result = coverage({
    campaigns: [{ name: "una", spend: 30 }],
    stores: [],
  });

  assert.equal(result.unassigned, 30);
  assert.equal(result.byStore.length, 0);
});

test("sin campañas no se inventa nada", () => {
  const result = coverage({ campaigns: [], stores: [mexico] });

  assert.equal(result.total, 0);
  assert.equal(isClean(result), true);
});

test("unos céntimos sueltos no se cuentan como problema", () => {
  // Una campaña de prueba apagada hace meses. Avisar de eso enseña a ignorar
  // los avisos.
  const result = coverage({
    campaigns: [
      { name: "220326_MX_NATUROX", spend: 100 },
      { name: "prueba antigua", spend: 0.4 },
    ],
    stores: [mexico],
  });

  assert.equal(isClean(result), true);
  assert.equal(isClean(result, 0), false);
});

test("los importes no arrastran decimales de coma flotante", () => {
  const result = coverage({
    campaigns: [
      { name: "220326_MX_a", spend: 0.1 },
      { name: "220326_MX_b", spend: 0.2 },
    ],
    stores: [mexico],
  });

  assert.equal(result.byStore[0].spend, 0.3);
  assert.equal(result.total, 0.3);
});
