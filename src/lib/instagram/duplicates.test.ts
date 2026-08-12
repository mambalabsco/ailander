import assert from "node:assert/strict";
import { test } from "node:test";

import { isRepeat, normalizeHook, similarity } from "./duplicates.ts";

test("el gancho se normaliza antes de comparar", () => {
  /*
   * Sin normalizar, «¿El zumbido no se va?» y «el zumbido no se va» son dos
   * ganchos distintos, y salen los dos.
   */
  assert.equal(normalizeHook("  ¿El ZUMBIDO no se va?  "), "el zumbido no se va");
  assert.equal(normalizeHook("¡Duermes mal, otra vez!"), "duermes mal otra vez");
});

test("el mismo gancho con otra puntuación se detecta", () => {
  assert.ok(isRepeat("¿El zumbido no se va?", ["El zumbido no se va"]));
});

test("un gancho distinto no se marca", () => {
  assert.ok(!isRepeat("Tu almohada no es el problema", ["El zumbido no se va"]));
});

test("dos formas de decir lo mismo se parecen sin ser iguales", () => {
  const parecido = similarity(
    normalizeHook("el zumbido no se va nunca"),
    normalizeHook("el zumbido no se va"),
  );

  assert.ok(parecido > 0.6, `esperaba parecido alto, salió ${parecido}`);
  assert.ok(parecido < 1, "no son idénticos");
});

test("compartir tema no es repetirse", () => {
  /*
   * Dos publicaciones pueden hablar del sueño toda la semana: eso es tener una
   * línea. Repetirse es decirlo con las mismas palabras.
   */
  assert.ok(
    !isRepeat("Duermes ocho horas y amaneces roto", ["El zumbido no te deja dormir"]),
  );
});

test("sin historial nada es repetido", () => {
  assert.ok(!isRepeat("El zumbido no se va", []));
});

test("el umbral se puede subir para ser más permisivo", () => {
  const casi = "el zumbido no se va nunca";
  const antes = ["el zumbido no se va"];

  assert.ok(isRepeat(casi, antes, 0.6));
  assert.ok(!isRepeat(casi, antes, 0.99));
});
