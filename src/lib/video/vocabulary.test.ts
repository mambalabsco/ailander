import assert from "node:assert/strict";
import { test } from "node:test";

import { buildVocabulary, MAX_ENTRIES, subtitleLanguage } from "./vocabulary.ts";

test("una toma sin `sub` no genera corrección", () => {
  const entries = buildVocabulary({
    shots: [{ guion: "esto se escribe igual que suena" }],
  });

  assert.deepEqual(entries, []);
});

/*
 * El caso que motiva el archivo entero: el guion va fonético para que la voz
 * pronuncie bien, y sin esto el subtítulo saldría escrito «eme ce te».
 */
test("aísla la palabra que difiere, no la frase entera", () => {
  const entries = buildVocabulary({
    shots: [
      {
        guion: "el aceite de eme ce te ayuda por la mañana",
        sub: "el aceite de MCT ayuda por la mañana",
      },
    ],
  });

  assert.deepEqual(entries, [{ word: "MCT", replaces: ["eme ce te"] }]);
});

test("cuando difieren de cabo a rabo va la frase completa", () => {
  const entries = buildVocabulary({
    shots: [{ guion: "uno dos tres", sub: "1 2 3" }],
  });

  assert.deepEqual(entries, [{ word: "1 2 3", replaces: ["uno dos tres"] }]);
});

test("la misma palabra en varias tomas se junta en una entrada", () => {
  const entries = buildVocabulary({
    shots: [
      { guion: "toma eme ce te ahora", sub: "toma MCT ahora" },
      { guion: "dos de eme ce te al día", sub: "dos de MCT al día" },
    ],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].word, "MCT");
});

/*
 * Ninguna entrada puede salir sin sustituciones.
 *
 * El servicio exige `replaces` con al menos un elemento y devuelve 422 si
 * falta — y ese 422 deja el vídeo entero **sin ningún subtítulo**, no solo sin
 * esa corrección. Es el fallo que hubo que arreglar.
 */
test("nunca sale una entrada sin sustituciones", () => {
  const entries = buildVocabulary({
    shots: [
      { guion: "toma eme ce te", sub: "toma MCT" },
      { guion: "colágeno", sub: "Colágeno" },
      { guion: "sin sub ninguno" },
    ],
  });

  for (const entry of entries) {
    assert.ok(entry.replaces.length >= 1, `«${entry.word}» saldría sin sustituciones`);
  }
});

test("lo que se escribe como suena no genera entrada", () => {
  // Cambiar solo la mayúscula no es una corrección que el servicio pueda usar.
  assert.deepEqual(buildVocabulary({ shots: [{ guion: "colágeno", sub: "Colágeno" }] }), []);
});

test("se respeta el tope del servicio", () => {
  const shots = Array.from({ length: 150 }, (_, index) => ({
    guion: `palabra numero ${index}`,
    sub: `PALABRA-${index}`,
  }));

  assert.equal(buildVocabulary({ shots }).length, MAX_ENTRIES);
});

test("los espacios de más no crean entradas distintas", () => {
  const entries = buildVocabulary({
    shots: [{ guion: "toma  eme ce te", sub: "toma   MCT" }],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].word, "MCT");
});

test("se respetan los topes de cada entrada", () => {
  const largo = "a".repeat(300);

  const entries = buildVocabulary({ shots: [{ guion: largo, sub: `${"b".repeat(300)}` }] });

  assert.ok(entries[0].word.length <= 100);
  assert.ok(entries[0].replaces.every((item) => item.length <= 100));
});

test("el idioma sale del mercado, y sin mercado sigue siendo español", () => {
  assert.equal(subtitleLanguage("Chile"), "es-CL");
  assert.equal(subtitleLanguage("méxico"), "es-MX");
  assert.equal(subtitleLanguage(""), "es-ES");
  assert.equal(subtitleLanguage(undefined), "es-ES");
  assert.equal(subtitleLanguage("Narnia"), "es-ES");
});
