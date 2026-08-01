import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITIES,
  ROLES,
  ROLE_DESCRIPTIONS,
  can,
  canAssign,
  canDisable,
  capabilitiesOf,
  isRole,
  spendCheck,
} from "./roles.ts";

/* ------------------------------- El reparto -------------------------------- */

test("el redactor gasta pero no publica", () => {
  // Es la separación que más se usa: se genera todo el día, y quien decide que
  // algo salga a la tienda es otra persona.
  assert.equal(can("redactor", "gastar"), true);
  assert.equal(can("redactor", "publicar"), false);
});

test("el analista ve el dinero y no gasta nada", () => {
  assert.equal(can("analista", "dinero"), true);
  assert.equal(can("analista", "gastar"), false);
  assert.equal(can("analista", "publicar"), false);
});

test("el editor saca el trabajo pero no ve claves ni márgenes", () => {
  assert.equal(can("editor", "publicar"), true);
  assert.equal(can("editor", "secretos"), false);
  assert.equal(can("editor", "dinero"), false);
});

test("el invitado no puede nada", () => {
  assert.deepEqual(capabilitiesOf("invitado"), []);
});

test("solo el dueño y el admin gestionan personas", () => {
  const conPersonas = ROLES.filter((role) => can(role, "personas"));

  assert.deepEqual(conPersonas, ["dueño", "admin"]);
});

test("cada papel tiene descripción: sin ella se elige a ciegas", () => {
  for (const role of ROLES) {
    assert.ok(ROLE_DESCRIPTIONS[role]?.length > 20, `${role} sin describir`);
  }
});

test("un papel inventado no cuela", () => {
  assert.equal(isRole("superadmin"), false);
  assert.equal(isRole("editor"), true);
});

test("ningún permiso se queda sin dueño", () => {
  // Un permiso que nadie tiene es una función inalcanzable.
  for (const capability of CAPABILITIES) {
    assert.ok(ROLES.some((role) => can(role, capability)), `${capability} no lo tiene nadie`);
  }
});

/* ---------------------------- Quién toca a quién --------------------------- */

const admin = { id: "a", role: "admin" as const };
const editor = { id: "b", role: "editor" as const };
const dueño = { id: "c", role: "dueño" as const };

test("nadie se cambia el papel a sí mismo", () => {
  // Evita que un admin se ascienda, y también que se quite el permiso sin
  // querer y se quede fuera.
  const result = canAssign(admin, admin, "dueño");

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /a ti mismo/);
});

test("nadie asciende a otro por encima de sí mismo", () => {
  const result = canAssign(editor, admin, "admin");

  assert.equal(result.ok, false);
});

test("al dueño no lo toca nadie", () => {
  // Si un admin pudiera degradarlo, un admin equivocado deja la plataforma sin
  // nadie que pueda arreglarlo.
  assert.equal(canAssign(admin, dueño, "editor").ok, false);
  assert.equal(canDisable(admin, dueño).ok, false);
});

test("la propiedad no se asigna, se transfiere aparte", () => {
  const result = canAssign(admin, editor, "dueño");

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /transfiere/);
});

test("un admin sí puede cambiar a un editor", () => {
  assert.equal(canAssign(admin, editor, "redactor").ok, true);
  assert.equal(canDisable(admin, editor).ok, true);
});

test("quien no gestiona personas no cambia nada", () => {
  assert.equal(canAssign({ id: "x", role: "redactor" }, editor, "invitado").ok, false);
});

/* -------------------------------- El gasto --------------------------------- */

test("sin permiso de gastar no se lanza nada", () => {
  const result = spendCheck({ role: "analista", limitUsd: 100, spentUsd: 0 });

  assert.equal(result.ok, false);
});

test("sin límite se pasa siempre", () => {
  // Ponerle tope a quien paga la factura solo sirve para bloquearle un domingo.
  assert.equal(spendCheck({ role: "dueño", limitUsd: null, spentUsd: 9999 }).ok, true);
});

test("al llegar al límite se frena, y el aviso dice cuánto", () => {
  const result = spendCheck({ role: "redactor", limitUsd: 20, spentUsd: 20 });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /20\.00 USD/);
  assert.match(result.ok ? "" : result.reason, /administrador/);
});

test("por debajo del límite se sigue trabajando", () => {
  assert.equal(spendCheck({ role: "redactor", limitUsd: 20, spentUsd: 19.99 }).ok, true);
});
