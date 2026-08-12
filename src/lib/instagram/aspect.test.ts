import assert from "node:assert/strict";
import { test } from "node:test";

import { checkAspect } from "./aspect.ts";

test("la vertical 4:5 vale para el feed", () => {
  assert.equal(checkAspect(1080, 1350, "feed").ok, true);
});

test("el cuadrado y el apaisado también valen en el feed", () => {
  // Instagram acepta de 4:5 a 1.91:1. Rechazar el cuadrado sería inventarse un
  // límite que no existe.
  assert.equal(checkAspect(1080, 1080, "feed").ok, true);
  assert.equal(checkAspect(1910, 1000, "feed").ok, true);
});

test("una vertical de 1080×1351 vale: el generador no clava el píxel", () => {
  /*
   * 0.7994 contra un 0.8 exacto. Sin holgura se rechazaba siempre, y como el
   * relleno regeneraba la imagen en cada vuelta, esa pieza costaba una
   * generación cada cinco minutos para volver a caer por lo mismo. La rama
   * vertical ya tenía ±0.03 desde el principio.
   */
  assert.equal(checkAspect(1080, 1351, "feed").ok, true);
});

test("más alta que 4:5 no vale en el feed, y se dice por qué", () => {
  const resultado = checkAspect(1080, 1920, "feed");

  assert.equal(resultado.ok, false);
  assert.ok(resultado.reason.includes("4:5"), `el motivo tiene que citar el límite: ${resultado.reason}`);
});

test("el reel y la historia quieren 9:16", () => {
  assert.equal(checkAspect(1080, 1920, "reel").ok, true);
  assert.equal(checkAspect(1080, 1920, "historia").ok, true);
});

test("una imagen de feed mandada a un reel se rechaza", () => {
  assert.equal(checkAspect(1080, 1350, "reel").ok, false);
});

test("dimensiones imposibles no revientan", () => {
  // Un generador que devuelve una imagen rota no debería tumbar la vuelta del
  // cron: se rechaza esa pieza y se sigue.
  assert.equal(checkAspect(0, 0, "feed").ok, false);
  assert.equal(checkAspect(-10, 100, "feed").ok, false);
});
