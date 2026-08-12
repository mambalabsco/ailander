import assert from "node:assert/strict";
import { test } from "node:test";

import { decide, horaProgramada, SEPARACION_MINUTOS, TOPE_API } from "./autopilot.ts";

const base = {
  ahora: "2026-08-12T19:00:00.000Z",
  porDia: 1,
  colchonDias: 3,
  horaDesde: 18,
  horaHasta: 21,
  publicadasUltimas24h: 0,
  ultimaPublicacionAt: null as string | null,
  listas: [] as { scheduledAt: string }[],
};

test("con la cola vacía se escribe el colchón entero", () => {
  const { escribir } = decide(base);

  assert.equal(escribir, 3, "tres días × una al día");
});

test("con el colchón lleno no se escribe nada", () => {
  const listas = [
    { scheduledAt: "2026-08-13T19:00:00.000Z" },
    { scheduledAt: "2026-08-14T19:00:00.000Z" },
    { scheduledAt: "2026-08-15T19:00:00.000Z" },
  ];

  assert.equal(decide({ ...base, listas }).escribir, 0);
});

test("solo se escribe lo que falta, no el colchón entero", () => {
  const listas = [{ scheduledAt: "2026-08-13T19:00:00.000Z" }];

  assert.equal(decide({ ...base, listas }).escribir, 2);
});

test("dos al día piden el doble de colchón", () => {
  assert.equal(decide({ ...base, porDia: 2 }).escribir, 6);
});

test("se publica cuando toca", () => {
  const { publicar } = decide(base);

  assert.equal(publicar, true);
});

test("el tope propio del día detiene la publicación", () => {
  const resultado = decide({ ...base, publicadasUltimas24h: 1, porDia: 1 });

  assert.equal(resultado.publicar, false);
  assert.ok(resultado.motivo.includes("tope"), `el motivo tiene que decirlo: ${resultado.motivo}`);
});

test("el tope de la API manda aunque el propio sea altísimo", () => {
  /*
   * Pasarse no falla al programar: falla al publicar, horas después. Así que se
   * para aquí y no allí.
   */
  const resultado = decide({ ...base, porDia: 100, publicadasUltimas24h: TOPE_API });

  assert.equal(resultado.publicar, false);
  assert.ok(resultado.motivo.includes("Instagram"));
});

test("la separación mínima evita que un atasco resuelto vomite cinco seguidas", () => {
  const haceDiezMinutos = "2026-08-12T18:50:00.000Z";
  const resultado = decide({ ...base, ultimaPublicacionAt: haceDiezMinutos });

  assert.equal(resultado.publicar, false);
  assert.ok(resultado.motivo.includes("separación"));
});

test("pasada la separación se vuelve a publicar", () => {
  const haceDosHoras = "2026-08-12T17:00:00.000Z";

  assert.equal(decide({ ...base, ultimaPublicacionAt: haceDosHoras }).publicar, true);
});

test("no poder publicar no impide seguir rellenando", () => {
  /*
   * Son dos cosas independientes: que hoy ya se haya publicado no significa que
   * la cola de la semana que viene esté llena.
   */
  const resultado = decide({ ...base, publicadasUltimas24h: 1 });

  assert.equal(resultado.publicar, false);
  assert.equal(resultado.escribir, 3);
});

test("la hora cae dentro de la ventana", () => {
  const cuando = new Date(horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno"));
  const hora = cuando.getUTCHours();

  assert.ok(hora >= 18 && hora <= 21, `salió a las ${hora}`);
});

test("la misma pieza da siempre la misma hora", () => {
  /*
   * Determinista y no aleatoria: dos vueltas del cron sobre la misma pieza le
   * pondrían dos horas distintas, y el calendario cambiaría solo.
   */
  const uno = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno");
  const otro = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno");

  assert.equal(uno, otro);
});

test("dos piezas del mismo día no caen a la misma hora clavada", () => {
  const uno = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-uno");
  const otro = horaProgramada(new Date(base.ahora), 1, 18, 21, "pieza-dos");

  assert.notEqual(uno, otro);
});

test("cada día va después del anterior", () => {
  const primero = horaProgramada(new Date(base.ahora), 1, 18, 21, "a");
  const segundo = horaProgramada(new Date(base.ahora), 2, 18, 21, "a");

  assert.ok(new Date(segundo) > new Date(primero));
});

test("la separación mínima es la que dice la constante", () => {
  assert.equal(SEPARACION_MINUTOS, 90);
});
