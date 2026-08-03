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

test("la marca entra aunque nadie la escriba distinto", () => {
  // Es lo que más falla: no está en el diccionario del transcriptor.
  const entries = buildVocabulary({ shots: [], terms: ["Naturox"] });

  assert.deepEqual(entries, [{ word: "Naturox", replaces: [] }]);
});

test("no se cuela una corrección que no corrige nada", () => {
  const entries = buildVocabulary({
    shots: [{ guion: "colágeno", sub: "Colágeno" }],
  });

  // Se escribe como suena: la entrada no lleva sustitución.
  assert.deepEqual(entries[0].replaces, []);
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

test("el idioma sale del mercado, y sin mercado sigue siendo español", () => {
  assert.equal(subtitleLanguage("Chile"), "es-CL");
  assert.equal(subtitleLanguage("méxico"), "es-MX");
  assert.equal(subtitleLanguage(""), "es-ES");
  assert.equal(subtitleLanguage(undefined), "es-ES");
  assert.equal(subtitleLanguage("Narnia"), "es-ES");
});
