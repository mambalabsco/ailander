import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIPSYNC_MODELS,
  buildLipsyncBody,
  findLipsyncModel,
  isSyncMode,
  isTerminal,
  lipsyncCostUsd,
  lipsyncError,
} from "./lipsync.ts";

test("un modelo desconocido cae en el barato, no revienta", () => {
  assert.equal(findLipsyncModel("").id, "lipsync-2");
  assert.equal(findLipsyncModel("inventado").id, "lipsync-2");
  assert.equal(findLipsyncModel("sync-3").id, "sync-3");
});

test("todos los modelos tienen precio y son los que la API acepta", () => {
  const accepted = new Set(["sync-3", "lipsync-2", "lipsync-2-pro", "lipsync-1.9.0-beta", "react-1"]);

  for (const model of LIPSYNC_MODELS) {
    assert.ok(accepted.has(model.id), `${model.id} no está en el enum de la API`);
    assert.ok(model.usdPerSecond > 0);
  }
});

test("el coste va por segundo de vídeo", () => {
  assert.equal(lipsyncCostUsd("lipsync-2", 10), 0.5);
  assert.equal(lipsyncCostUsd("sync-3", 15), 1.995);
});

test("una duración imposible cuesta cero en vez de NaN", () => {
  // Un NaN en la barra de costes se propaga a la suma y borra el total entero.
  assert.equal(lipsyncCostUsd("lipsync-2", Number.NaN), 0);
  assert.equal(lipsyncCostUsd("lipsync-2", -4), 0);
});

test("el cuerpo lleva el vídeo y el audio en su sitio", () => {
  const body = buildLipsyncBody({ videoUrl: "https://v/1.mp4", audioUrl: "https://a/1.mp3" });
  const input = body.input as { type: string; url: string }[];

  assert.equal(input[0].type, "video");
  assert.equal(input[0].url, "https://v/1.mp4");
  assert.equal(input[1].type, "audio");
  assert.equal(input[1].url, "https://a/1.mp3");
});

test("sin modo, se ajusta la velocidad en vez de cortar", () => {
  // El defecto de la API recorta, y lo que se pierde es el final de la locución.
  const body = buildLipsyncBody({ videoUrl: "https://v/1.mp4", audioUrl: "https://a/1.mp3" });

  assert.equal((body.options as { sync_mode: string }).sync_mode, "remap");
});

test("un modo inventado no se manda", () => {
  const body = buildLipsyncBody({
    videoUrl: "https://v/1.mp4",
    audioUrl: "https://a/1.mp3",
    syncMode: "acelerar",
  });

  assert.equal((body.options as { sync_mode: string }).sync_mode, "remap");
  assert.ok(isSyncMode("loop"));
  assert.ok(!isSyncMode("acelerar"));
});

test("la temperatura solo va si se pide, y dentro de rango", () => {
  const sin = buildLipsyncBody({ videoUrl: "https://v/1.mp4", audioUrl: "https://a/1.mp3" });
  assert.ok(!("temperature" in (sin.options as Record<string, unknown>)));

  const con = buildLipsyncBody({
    videoUrl: "https://v/1.mp4",
    audioUrl: "https://a/1.mp3",
    temperature: 4,
  });
  assert.equal((con.options as { temperature: number }).temperature, 1);
});

test("falta el vídeo o el audio y se dice aquí, no en un 422", () => {
  assert.throws(() => buildLipsyncBody({ videoUrl: "", audioUrl: "https://a/1.mp3" }), /vídeo/);
  assert.throws(() => buildLipsyncBody({ videoUrl: "https://v/1.mp4", audioUrl: "" }), /audio/);
});

test("solo tres estados terminan", () => {
  assert.ok(isTerminal("COMPLETED"));
  assert.ok(isTerminal("FAILED"));
  assert.ok(isTerminal("REJECTED"));
  assert.ok(!isTerminal("PENDING"));
  assert.ok(!isTerminal("PROCESSING"));
});

test("un rechazo dice que no se reintente", () => {
  assert.match(lipsyncError("REJECTED", "contenido"), /dará lo mismo/);
  assert.match(lipsyncError("FAILED", ""), /sin motivo/);
});
