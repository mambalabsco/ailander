import assert from "node:assert/strict";
import { test } from "node:test";

import { SUBTITLE_PRESETS } from "./captions.ts";

/*
 * Los estilos son los del servicio y sus identificadores tienen que coincidir
 * con los suyos: uno mal escrito lo rechaza al quemar, o sea después de haber
 * pagado el montaje entero.
 */
const DEL_SERVICIO = new Set([
  "glass",
  "whisper",
  "glide2",
  "fusion",
  "glide",
  "terminal",
  "handwritten",
  "backdrop",
  "backdrop2",
  "simple",
  "plain",
  "beans",
  "corpo",
  "boo",
  "shadeplay",
  "casper",
  "capri",
  "lowkey",
  "vinta",
  "diego",
  "ali",
  "slay",
  "kitty",
  "hustle",
  "karl",
  "sprout",
  "flex",
  "mint",
  "rizz",
  "vegas",
]);

test("todos los estilos existen en el servicio", () => {
  for (const preset of SUBTITLE_PRESETS) {
    assert.ok(DEL_SERVICIO.has(preset.id), `«${preset.id}» no es un estilo del servicio`);
  }
});

test("no hay estilos repetidos", () => {
  const ids = new Set(SUBTITLE_PRESETS.map((preset) => preset.id));

  assert.equal(ids.size, SUBTITLE_PRESETS.length);
});

test("cada estilo se explica, para poder elegir sin probarlos todos", () => {
  for (const preset of SUBTITLE_PRESETS) {
    assert.ok(preset.label.trim().length > 0);
    assert.ok(preset.note.trim().length > 10);
  }
});
