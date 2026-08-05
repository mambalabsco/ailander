import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MUSIC_STYLES,
  buildMusicInput,
  buildMusicPrompt,
  variationHint,
  findMusicGenerator,
  generatorsFor,
  guaranteesVariation,
  outOfReachNote,
  musicCost,
  musicCostLabel,
  MUSIC_GENERATORS,
  readMusicUrl,
} from "./music.ts";

const byId = (id: string) => findMusicGenerator(id);

test("cada generador tiene identificador y dirección propios", () => {
  assert.equal(new Set(MUSIC_GENERATORS.map((m) => m.id)).size, MUSIC_GENERATORS.length);
  assert.equal(new Set(MUSIC_GENERATORS.map((m) => m.slug)).size, MUSIC_GENERATORS.length);
});

test("uno desconocido cae en el barato, no revienta", () => {
  assert.equal(findMusicGenerator("no-existe").id, MUSIC_GENERATORS[0].id);
});

/*
 * ElevenLabs pide la duración en **milisegundos**. Mandarle segundos no da
 * error: da tres segundos de música donde se pedían tres minutos.
 */
test("la duración va en la unidad de cada modelo", () => {
  assert.equal(buildMusicInput(byId("cassette"), { prompt: "x", seconds: 45 }).duration, 45);
  assert.equal(
    buildMusicInput(byId("elevenlabs"), { prompt: "x", seconds: 45 }).music_length_ms,
    45_000,
  );
  assert.equal(
    buildMusicInput(byId("stable-audio"), { prompt: "x", seconds: 45 }).seconds_total,
    45,
  );
});

test("la duración se recorta a lo que admite cada uno", () => {
  // Cassette no baja de diez segundos.
  assert.equal(buildMusicInput(byId("cassette"), { prompt: "x", seconds: 4 }).duration, 10);
  assert.equal(buildMusicInput(byId("cassette"), { prompt: "x", seconds: 500 }).duration, 180);
});

test("a los que no la aceptan no se les manda duración", () => {
  const input = buildMusicInput(byId("minimax"), { prompt: "x", seconds: 45 });

  assert.equal(input.duration, undefined);
  assert.equal(input.music_length_ms, undefined);
  assert.equal(input.seconds_total, undefined);
});

test("lo instrumental se pide por el campo, no solo en el prompt", () => {
  // Una cama con voz compite con la locución: el prompt lo sugiere, el campo lo
  // garantiza.
  assert.equal(buildMusicInput(byId("elevenlabs"), { prompt: "x", seconds: 30 }).force_instrumental, true);
  assert.equal(buildMusicInput(byId("minimax"), { prompt: "x", seconds: 30 }).is_instrumental, true);

  // Y al que no lo tiene no se le inventa el campo.
  assert.equal(buildMusicInput(byId("cassette"), { prompt: "x", seconds: 30 }).force_instrumental, undefined);
});

test("el prompt siempre viaja", () => {
  for (const model of MUSIC_GENERATORS) {
    assert.equal(buildMusicInput(model, { prompt: "hola", seconds: 30 }).prompt, "hola");
  }
});

/* --------------------------- Leer el resultado ----------------------------- */

/*
 * Cassette lo devuelve en `audio_file` y el resto en `audio`. Buscar el campo
 * que no es devuelve vacío, no un error, y el fallo aparece al montar.
 */
test("el audio se lee del campo de cada modelo", () => {
  assert.equal(
    readMusicUrl(byId("cassette"), { audio_file: { url: "https://x.co/a.wav" } }),
    "https://x.co/a.wav",
  );

  assert.equal(
    readMusicUrl(byId("elevenlabs"), { audio: { url: "https://x.co/b.mp3" } }),
    "https://x.co/b.mp3",
  );

  // Y no se cruzan: el de uno en el campo del otro no vale.
  assert.equal(readMusicUrl(byId("elevenlabs"), { audio_file: { url: "https://x.co/a.wav" } }), "");
});

test("acepta que el audio venga como texto suelto", () => {
  assert.equal(readMusicUrl(byId("elevenlabs"), { audio: "https://x.co/b.mp3" }), "https://x.co/b.mp3");
});

test("una respuesta rara devuelve vacío en vez de romper", () => {
  assert.equal(readMusicUrl(byId("cassette"), null), "");
  assert.equal(readMusicUrl(byId("cassette"), { audio_file: 42 }), "");
  assert.equal(readMusicUrl(byId("cassette"), {}), "");
});

/* ------------------------------- El precio --------------------------------- */

test("el precio sale por minuto de salida", () => {
  // Cassette: dos céntimos el minuto, y medio minuto es un céntimo.
  assert.equal(musicCost(byId("cassette"), 30), 0.01);
  assert.equal(musicCost(byId("cassette"), 60), 0.02);
});

test("quien cobra el minuto empezado lo cobra entero", () => {
  // ElevenLabs redondea hacia arriba: 30 s pagan un minuto completo.
  assert.equal(musicCost(byId("elevenlabs"), 30), 0.8);
  assert.equal(musicCost(byId("elevenlabs"), 61), 1.6);
});

test("sin precio publicado no se inventa uno", () => {
  assert.equal(musicCost(byId("minimax"), 30), null);
  assert.match(musicCostLabel(byId("minimax"), 30), /sin confirmar/);
});

test("la etiqueta avisa de que se cobra el minuto empezado", () => {
  assert.match(musicCostLabel(byId("elevenlabs"), 30), /minuto empezado/);
  assert.equal(musicCostLabel(byId("cassette"), 30).includes("minuto empezado"), false);
});

/* --------------------- Qué música se le pide al modelo --------------------- */

/* Una cama con voz compite con la locución por el mismo sitio del oído: no es
 * cuestión de volumen, es que no caben dos voces. */
test("el encargo pide siempre instrumental", () => {
  for (const style of MUSIC_STYLES) {
    const prompt = buildMusicPrompt({ productName: "x", audience: "y", styleId: style.id });

    assert.match(prompt, /No vocals/, style.id);
    assert.match(prompt, /voice-over goes on top/, style.id);
  }
});

test("el producto y el público entran en el encargo", () => {
  const prompt = buildMusicPrompt({ productName: "Naturox", audience: "mujeres de 45" });

  assert.match(prompt, /Naturox/);
  assert.match(prompt, /mujeres de 45/);
});

/*
 * «Inspiracional» no le dice nada a un generador: cada modelo lo interpreta como
 * quiere. Instrumentos, tempo y arreglo sí, y sale parecido dos veces seguidas.
 */
test("cada estilo manda sus instrumentos, su tempo y su arreglo", () => {
  const prompt = buildMusicPrompt({ productName: "x", audience: "y", styleId: "inspiracional" });

  assert.match(prompt, /Instruments: .*piano/);
  assert.match(prompt, /Tempo: 88 BPM/);
  assert.match(prompt, /Arrangement: .*strings enter/);
});

/*
 * El fallo de la primera versión: se pedía dinámica plana y sin subidas **a
 * todo**. Para una cama bajo una locución densa está bien; para un anuncio tipo
 * película es la receta de una pista sosa.
 */
test("solo la cama neutra pide quedarse plana", () => {
  assert.match(buildMusicPrompt({ productName: "x", audience: "y", styleId: "cama" }), /no build/);

  assert.ok(
    !buildMusicPrompt({ productName: "x", audience: "y", styleId: "cinematografico" }).includes(
      "no build",
    ),
  );
});

/* Y el cinematográfico sí pide lo contrario: que crezca y suelte. */
test("el cinematográfico pide tensión y una liberación", () => {
  const prompt = buildMusicPrompt({ productName: "x", audience: "y", styleId: "cinematografico" });

  assert.match(prompt, /tension builds/);
  assert.match(prompt, /release/);
});

test("un estilo que no existe cae en uno bueno, no en nada", () => {
  assert.match(buildMusicPrompt({ productName: "x", audience: "y", styleId: "raro" }), /Style: /);
});

/* Lo escrito a mano se suma al estilo, no lo sustituye. */
test("el matiz a mano se añade sin borrar el estilo", () => {
  const prompt = buildMusicPrompt({
    productName: "x",
    audience: "y",
    styleId: "emotivo",
    mood: "con un reloj de fondo",
  });

  assert.match(prompt, /solo cello/);
  assert.match(prompt, /reloj de fondo/);
});

test("los segundos se dicen cuando se saben", () => {
  assert.match(buildMusicPrompt({ productName: "x", audience: "y", seconds: 45 }), /about 45 seconds/);
  assert.ok(!buildMusicPrompt({ productName: "x", audience: "y" }).includes("Length"));
});

test("todos los estilos están descritos", () => {
  for (const style of MUSIC_STYLES) {
    assert.ok(style.label && style.note && style.instruments && style.tempo, style.id);
  }
});

/* -------------------- Que la segunda vez no suene igual -------------------- */

/*
 * El fallo que motivó esto: generar dos veces con Lyria devolvía exactamente la
 * misma pieza. Solo uno de los cinco acepta semilla, así que en el resto lo
 * único que se puede cambiar es el encargo.
 */
test("el primer intento va con el encargo limpio", () => {
  const input = buildMusicInput(byId("lyria"), { prompt: "cálida", seconds: 30, take: 1 });

  assert.equal(input.prompt, "cálida");
});

test("a partir del segundo se le pide otra toma", () => {
  const dos = buildMusicInput(byId("lyria"), { prompt: "cálida", seconds: 30, take: 2 });
  const tres = buildMusicInput(byId("lyria"), { prompt: "cálida", seconds: 30, take: 3 });

  assert.notEqual(dos.prompt, "cálida");
  assert.notEqual(dos.prompt, tres.prompt);

  // Y el encargo original sigue dentro: se añade, no se sustituye.
  assert.match(String(dos.prompt), /^cálida /);
});

test("donde hay semilla, cada intento lleva la suya", () => {
  const uno = buildMusicInput(byId("stable-audio"), { prompt: "x", seconds: 30, take: 1 });
  const dos = buildMusicInput(byId("stable-audio"), { prompt: "x", seconds: 30, take: 2 });

  assert.notEqual(uno.seed, dos.seed);
  assert.equal(guaranteesVariation(byId("stable-audio")), true);
});

test("a los que no la aceptan no se les manda semilla", () => {
  assert.equal(buildMusicInput(byId("lyria"), { prompt: "x", seconds: 30, take: 2 }).seed, undefined);
  assert.equal(guaranteesVariation(byId("lyria")), false);
});

test("un intento absurdo no rompe el encargo", () => {
  const input = buildMusicInput(byId("lyria"), { prompt: "x", seconds: 30, take: 99 });

  assert.equal(typeof input.prompt, "string");
  assert.ok(String(input.prompt).length > 1);
});

/*
 * «Otra toma, misma idea» es lo que le pedirías a un músico, y con un músico
 * funciona. A un modelo sin semilla no: el encargo le sigue describiendo la
 * misma pieza y devuelve la misma pieza. Lyria 3 la repitió tres veces seguidas.
 */
test("la variación cambia algo de la partitura, no la cortesía", () => {
  const dos = variationHint(2);

  assert.match(dos, /key|chord|tempo|time feel|minor/i);
  assert.ok(!/same brief/i.test(dos));
});

test("cada toma pide un cambio distinto", () => {
  const takes = [2, 3, 4, 5, 6, 7].map((n) => variationHint(n));

  assert.equal(new Set(takes).size, takes.length);
});

/* La séptima toma no puede quedarse sin instrucción. */
test("después de las que hay, se vuelve a empezar en vez de quedarse sin nada", () => {
  assert.ok(variationHint(20).length > 20);
});

test("la primera toma no lleva variación", () => {
  const input = buildMusicInput(MUSIC_GENERATORS[0], { prompt: "algo", seconds: 30, take: 1 });

  assert.equal(input.prompt, "algo");
});

test("la segunda sí, pegada al encargo original", () => {
  const input = buildMusicInput(MUSIC_GENERATORS[0], { prompt: "algo", seconds: 30, take: 2 });

  assert.match(String(input.prompt), /^algo /);
  assert.match(String(input.prompt), /Different take/);
});

test("para un vídeo largo solo se ofrecen los que llegan", () => {
  /*
   * Con la lista entera delante, elegir uno de duración fija para un anuncio de
   * noventa segundos es un clic normal — y el resultado no se ve hasta tener el
   * vídeo montado.
   */
  const noventa = generatorsFor(90).map((model) => model.id);

  assert.ok(!noventa.includes("lyria"));
  assert.ok(!noventa.includes("minimax"));
  assert.ok(noventa.includes("elevenlabs"));
});

test("para uno corto siguen estando todos", () => {
  const corto = generatorsFor(20).map((model) => model.id);

  assert.equal(corto.length, MUSIC_GENERATORS.length);
});

test("nunca devuelve una lista vacía", () => {
  // Una lista vacía es una pantalla rota: el problema no es que no haya
  // generadores, es que ninguno da tanto — y eso se dice, no se esconde.
  assert.ok(generatorsFor(5000).length > 0);
  assert.match(outOfReachNote(5000), /Ninguno llega/);
});

test("sin duración pedida no se filtra nada", () => {
  assert.equal(generatorsFor(0).length, MUSIC_GENERATORS.length);
  assert.equal(generatorsFor(Number.NaN).length, MUSIC_GENERATORS.length);
});

test("cuando alguno llega, no se avisa de que no llega ninguno", () => {
  assert.equal(outOfReachNote(90), "");
});
