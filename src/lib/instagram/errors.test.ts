import assert from "node:assert/strict";
import { test } from "node:test";

import { esPermanente, InstagramError } from "./errors.ts";

test("el token caducado es permanente: no se arregla reintentando", () => {
  assert.equal(esPermanente(new InstagramError("Session expired", 190, 463)), true);
});

test("el permiso que falta es permanente", () => {
  assert.equal(esPermanente(new InstagramError("Permiso no concedido", 200, 0)), true);
});

test("la cuenta que no es profesional es permanente", () => {
  // Convertirla es cosa de una persona en la app de Instagram. Reintentar cada
  // cinco minutos no la convierte.
  assert.equal(esPermanente(new InstagramError("The user is not an Instagram Business", 10, 2207018)), true);
});

test("el 100 con subcódigo 33 es permanente: el objeto no existe o no se alcanza", () => {
  /*
   * La rama más frágil del módulo, y la única con dos condiciones. Normalmente
   * es la cuenta de Instagram equivocada: reintentarla cada cinco minutos no la
   * convierte en la buena.
   */
  assert.equal(esPermanente(new InstagramError("Unsupported get request", 100, 33)), true);
});

test("el mismo 100 con otro subcódigo es transitorio", () => {
  // Y esta es la mitad que se cae si alguien simplifica la condición a
  // `code === 100`: un parámetro mal puesto en una llamada concreta no es
  // motivo para pausar la cuenta entera.
  assert.equal(esPermanente(new InstagramError("Invalid parameter", 100, 2207032)), false);
  assert.equal(esPermanente(new InstagramError("Invalid parameter", 100, 0)), false);
});

test("el límite de peticiones es transitorio: mañana sí", () => {
  assert.equal(esPermanente(new InstagramError("Application request limit reached", 4, 0)), false);
});

test("un fallo de red no es permanente", () => {
  assert.equal(esPermanente(new Error("fetch failed")), false);
});

test("un error desconocido se trata como transitorio", () => {
  /*
   * Por defecto se reintenta: pausar el piloto por algo que no se conoce deja
   * la cuenta muda hasta que alguien mire, y eso es peor que tres reintentos de
   * más. Los tres fallos seguidos ya lo pausan de todas formas.
   */
  assert.equal(esPermanente(new InstagramError("vete a saber", 999, 0)), false);
});
