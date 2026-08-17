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

test("con ganadores reales se usan esos y no otros", () => {
  // No por escrúpulo: los reales ya están comprobados, y mezclarlos con
  // inventados hace que nadie sepa cuáles se pueden defender.
  assert.match(buildCasinoAdBrief(LLENO), /no inventes otros/i);
});

test("sin ganadores el nombre se inventa, pero el bono no", () => {
  const brief = buildCasinoAdBrief({ ...LLENO, ganadores: "" });

  assert.ok(!/Evaristo/.test(brief), "no debe arrastrar el ejemplo de otra pieza");
  assert.match(brief, /inventa el nombre/i);
  // Sin la bandera `s`, que el tsconfig no admite: dos comprobaciones sueltas
  // dicen lo mismo y no atan el test a cómo caiga el salto de línea.
  assert.match(brief, /El \*\*bono\*\* no se inventa/);
});

test("se pide variar el nombre entre anuncios", () => {
  // El mismo nombre en las cinco piezas de una tanda delata que son de molde.
  // `\s+` y no un espacio: el texto va justificado y el salto de línea cae justo
  // ahí. Un test que se rompe por dónde parte la línea no prueba nada.
  assert.match(buildCasinoAdBrief({ ...LLENO, ganadores: "" }), /var[íi]a el\s+nombre/i);
});

test("la jerga del dinero se dice para que el titular suene local", () => {
  assert.match(buildCasinoAdBrief(LLENO), /lucas/);
});

test("las notas libres van al final y enteras", () => {
  const brief = buildCasinoAdBrief({ ...LLENO, notas: "El sorteo es todos los miércoles." });

  assert.match(brief, /todos los miércoles/);
});
