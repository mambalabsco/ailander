import assert from "node:assert/strict";
import { test } from "node:test";

import { bloqueLibre } from "./tanda-libre.ts";

test("no viaja ninguna lista de formatos", () => {
  // Es el modo entero: en cuanto aparece un formato con nombre, el modelo se
  // agarra a él y devuelve las mismas piezas que el modo normal.
  const bloque = bloqueLibre({ total: 5, ultimasTandas: [] });

  assert.ok(!/rayo-de-negacion/.test(bloque));
  assert.ok(!/ganador-nominal/.test(bloque));
  assert.match(bloque, /invent/i);
});

test("se cae la plantilla tipográfica y se dice que se cae", () => {
  // Sin decirlo, el modelo arrastra el molde de siempre: tres alturas de texto,
  // tres viñetas y barra abajo. Callarlo no es lo mismo que prohibirlo.
  const bloque = bloqueLibre({ total: 5, ultimasTandas: [] });

  assert.match(bloque, /tres viñetas/i);
  assert.match(bloque, /barra inferior/i);
});

test("las tres reglas que quedan siguen ahí", () => {
  const bloque = bloqueLibre({ total: 8, ultimasTandas: [] });

  assert.match(bloque, /dispositivo/i);
  assert.match(bloque, /miniatura/i);
  // La paleta se dice con el número de la tanda: «una sola paleta» a secas no
  // le dice al modelo sobre cuántas piezas manda.
  assert.match(bloque, /paleta en las 8/i);
});

test("sin tandas anteriores no se escribe el encabezado vacío", () => {
  // Un encabezado sin nada debajo le dice al modelo que había algo que no vio.
  const bloque = bloqueLibre({ total: 5, ultimasTandas: [] });

  assert.ok(!/Lo que ya se generó/.test(bloque));
});

test("con tandas anteriores entran enteras y con el encargo de no repetirlas", () => {
  const bloque = bloqueLibre({
    total: 5,
    ultimasTandas: ["ADSET3_BOFU_Bono_De_Bienvenida", "ADSET4_TOFU_Sueldo_De_Por_Vida"],
  });

  assert.match(bloque, /ADSET3_BOFU_Bono_De_Bienvenida/);
  assert.match(bloque, /ADSET4_TOFU_Sueldo_De_Por_Vida/);
  assert.match(bloque, /no repitas/i);
});

test("se exige variedad medible, no «que sean distintos»", () => {
  // «Varía» es un adjetivo y se cumple escribiendo cinco veces lo mismo con
  // otras palabras. Lo que se puede comprobar es un recuento.
  const bloque = bloqueLibre({ total: 5, ultimasTandas: [] });

  assert.match(bloque, /tres emociones distintas/i);
  // `incrustad` y no la frase entera: lo que se comprueba es que exista la
  // exigencia, no cómo esté redactada hoy.
  assert.match(bloque, /incrustad/i);
  assert.match(bloque, /no hable de dinero/i);
});
