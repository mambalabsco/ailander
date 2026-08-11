import assert from "node:assert/strict";
import { test } from "node:test";

import { repeatsALot, since, spendByKind, spendByModel, typicalCost } from "./spend.ts";
import type { RunRecord } from "./data/runs.ts";

const run = (over: Partial<RunRecord>): RunRecord =>
  ({
    id: "x",
    productId: null,
    productName: null,
    kind: "copy",
    detail: null,
    model: "uno",
    status: "ok",
    error: null,
    inputTokens: 100,
    outputTokens: 100,
    webSearches: 0,
    costUsd: 1,
    createdAt: "2026-08-01T00:00:00Z",
    ...over,
  }) as RunRecord;

test("se agrupa por tipo y se ordena por lo que cuesta", () => {
  // De más caro a más barato: es el orden en el que se decide qué tocar.
  const rows = spendByKind([
    run({ kind: "copy", costUsd: 1 }),
    run({ kind: "imagen", costUsd: 5 }),
    run({ kind: "imagen", costUsd: 5 }),
  ]);

  assert.equal(rows[0].key, "imagen");
  assert.equal(rows[0].costUsd, 10);
  assert.equal(rows[0].runs, 2);
  assert.equal(rows[1].key, "copy");
});

test("lo que falló se pagó igual, y se cuenta aparte", () => {
  /*
   * Una llamada que termina en error consume: el modelo leyó la entrada y
   * escribió hasta donde llegó. Contarlo aparte convierte «los errores
   * molestan» en «los errores me costaron esto».
   */
  const [row] = spendByKind([
    run({ costUsd: 2, status: "ok" }),
    run({ costUsd: 3, status: "error" }),
  ]);

  assert.equal(row.costUsd, 5, "el total incluye lo fallido");
  assert.equal(row.failed, 1);
  assert.equal(row.wastedUsd, 3);
});

test("una llamada sin modelo no se pierde del recuento", () => {
  // Pasa con las que no pasan por el modelo de texto. Descartarlas dejaría el
  // panel cuadrando mal contra la factura, que es peor que una fila fea.
  const rows = spendByModel([run({ model: null, costUsd: 4 })]);

  assert.equal(rows[0].key, "(sin dato)");
  assert.equal(rows[0].costUsd, 4);
});

test("el coste típico es la mediana, no la media", () => {
  /*
   * Una tanda enorme desvía la media y haría parecer caro lo que casi siempre
   * es barato. Lo que hay que anunciar antes de pulsar es lo que pasa
   * normalmente.
   */
  const runs = [
    run({ kind: "copy", costUsd: 1 }),
    run({ kind: "copy", costUsd: 1 }),
    run({ kind: "copy", costUsd: 100 }),
  ];

  assert.equal(typicalCost(runs, "copy"), 1);
  assert.equal(typicalCost(runs, "imagen"), null, "sin datos no se inventa un precio");
});

test("lo fallido no cuenta para el precio que se anuncia", () => {
  // Una llamada que se cortó a la mitad costó menos, y anunciarla haría
  // prometer un precio que no se va a cumplir.
  const runs = [run({ kind: "copy", costUsd: 10 }), run({ kind: "copy", costUsd: 1, status: "error" })];

  assert.equal(typicalCost(runs, "copy"), 10);
});

test("se señala dónde se repite el contexto, sin prometer un porcentaje", () => {
  const rows = spendByKind([
    ...Array.from({ length: 25 }, () => run({ kind: "extraccion", inputTokens: 5_000, outputTokens: 200 })),
    run({ kind: "imagen", inputTokens: 100, outputTokens: 900 }),
  ]);

  const marcados = repeatsALot(rows).map((one) => one.key);

  assert.deepEqual(marcados, ["extraccion"], "muchas llamadas y mucha entrada por poca salida");
});

test("se puede mirar solo desde una fecha", () => {
  const runs = [run({ createdAt: "2026-07-01T00:00:00Z" }), run({ createdAt: "2026-08-05T00:00:00Z" })];

  assert.equal(since(runs, "2026-08-01T00:00:00Z").length, 1);
});
