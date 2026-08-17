import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCasinoAdBrief } from "./casino-ad-brief.ts";

const LLENO = {
  appName: "Monticello",
  bono: "$100.000 para jugar",
  premios: "1 casa ($350.000.000), 1 SUV ($40.000.000), sueldo de $1 millón mensual por 50 años, 1 viaje ($10.000.000)",
  ganadores: "Evaristo Castillo, Maipú, $42.640.550\nElena Balmaceda, San Miguel, un KIA 0km",
  tienda: "Google Play",
  jerga: "lucas",
  notas: "",
};

test("sin nada que decir no se escribe una sección vacía", () => {
  // Un encabezado sin datos debajo le dice al modelo que había un bono y no lo
  // vio, y entonces se lo inventa: un número inventado en un anuncio de dinero
  // es lo peor que puede salir de aquí.
  assert.equal(
    buildCasinoAdBrief({ appName: "", bono: "", premios: "", ganadores: "", tienda: "", jerga: "", notas: "" }),
    "",
  );
});

test("el bono entra tal cual, sin redondear ni interpretar", () => {
  const brief = buildCasinoAdBrief(LLENO);

  assert.match(brief, /\$100\.000 para jugar/);
});

test("los ganadores entran con su nombre, su comuna y su monto", () => {
  const brief = buildCasinoAdBrief(LLENO);

  assert.match(brief, /Evaristo Castillo/);
  assert.match(brief, /Maipú/);
  assert.match(brief, /42\.640\.550/);
});

test("se prohíbe inventar ganadores, que es el fallo caro", () => {
  // Un nombre y una comuna inventados en un anuncio que afirma un premio real no
  // es una licencia creativa: es un testimonio falso con nombre y apellido.
  assert.match(buildCasinoAdBrief(LLENO), /no te inventes/i);
});

test("sin ganadores no se pide el formato nominal", () => {
  const brief = buildCasinoAdBrief({ ...LLENO, ganadores: "" });

  assert.ok(!/Evaristo/.test(brief));
  assert.match(brief, /sin ganadores/i);
});

test("la jerga del dinero se dice para que el titular suene local", () => {
  assert.match(buildCasinoAdBrief(LLENO), /lucas/);
});

test("las notas libres van al final y enteras", () => {
  const brief = buildCasinoAdBrief({ ...LLENO, notas: "El sorteo es todos los miércoles." });

  assert.match(brief, /todos los miércoles/);
});
