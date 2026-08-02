import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RATES,
  NEGATIVE_PROMPT,
  cutDuration,
  deriveCuts,
  estimate,
  CLIP_THRESHOLD,
  VIDEO_MODELS,
  billedSeconds,
  findVideoModel,
  efficientShotCounts,
  keyframePrompt,
  shotCountOption,
  showsProduct,
  lipsyncTargets,
  motionPrompt,
  planDurations,
  reviewShots,
  type Shot,
  type TimedWord,
} from "./shots.ts";

function shot(values: Partial<Shot> = {}): Shot {
  return {
    n: "01",
    guion: "Duermes ocho horas y despiertas cansada",
    role: "story",
    scene: "Mujer sentada en el borde de la cama",
    motion: "She slowly rubs her eyes, morning light on her face",
    speaking: false,
    ...values,
  };
}

/** Convierte una frase en palabras temporizadas, medio segundo cada una. */
function timed(text: string, from = 0): TimedWord[] {
  return text.split(/\s+/).map((word, index) => ({
    word,
    start: from + index * 0.5,
    end: from + index * 0.5 + 0.5,
  }));
}

/* ------------------------------- Los cortes -------------------------------- */

test("los cortes salen de los tiempos reales, no de una estimación", () => {
  const shots = [
    shot({ n: "01", guion: "Duermes ocho horas" }),
    shot({ n: "02", guion: "y despiertas cansada" }),
  ];
  const words = timed("Duermes ocho horas y despiertas cansada");

  const { cuts, missing } = deriveCuts(shots, words);

  assert.equal(missing.length, 0);
  assert.deepEqual(
    cuts.map((cut) => [cut.n, cut.start, cut.end]),
    [
      ["01", 0, 1.5],
      ["02", 1.5, 3],
    ],
  );
});

test("la puntuación pegada a la palabra no rompe el emparejado", () => {
  const shots = [shot({ n: "01", guion: "No estaba triste. Estaba vacía" })];
  const words = timed("No estaba triste. Estaba vacía");

  const { cuts, missing } = deriveCuts(shots, words);

  assert.equal(missing.length, 0);
  // Cinco palabras a medio segundo: 2,5 s. El punto pegado a «triste» no cuenta.
  assert.equal(cutDuration(cuts[0]), 2.5);
});

test("una palabra repetida no manda el corte al sitio equivocado", () => {
  /*
   * Es el fallo que justifica no buscar cada frase por todo el audio. En un
   * anuncio la marca se repite siempre, y buscar desde el principio encontraría
   * la primera aparición: el vídeo se descuadra a mitad sin que nada avise.
   */
  const shots = [
    shot({ n: "01", guion: "Naturox cambió mi vida" }),
    shot({ n: "02", guion: "Naturox se toma cada mañana" }),
  ];
  const words = timed("Naturox cambió mi vida Naturox se toma cada mañana");

  const { cuts } = deriveCuts(shots, words);

  assert.equal(cuts[0].start, 0);
  // La segunda toma arranca en la SEGUNDA aparición de «Naturox», no en la primera.
  assert.equal(cuts[1].start, 2);
});

test("una toma que no está en el audio se devuelve como ausente, no se inventa", () => {
  const shots = [
    shot({ n: "01", guion: "Duermes ocho horas" }),
    shot({ n: "02", guion: "esta frase no se grabó" }),
  ];

  const { cuts, missing } = deriveCuts(shots, timed("Duermes ocho horas"));

  assert.equal(cuts.length, 1);
  assert.deepEqual(missing, ["02"]);
});

/* ------------------------------ Las duraciones ----------------------------- */

test("una toma que cabe en cinco segundos no paga el clip de diez", () => {
  const plans = planDurations([{ n: "01", start: 0, end: 4.2, guion: "" }]);

  assert.equal(plans[0].request, 5);
  assert.equal(plans[0].freeze, 0);
});

test("hasta 5,5 se cubre congelando el último fotograma", () => {
  /*
   * Es el ahorro de la regla. El generador entrega ~4,85 s reales cuando se le
   * piden cinco; estirar tres décimas del último fotograma no se nota porque es
   * el instante antes del corte, y evita pagar el clip de diez.
   */
  const plans = planDurations([{ n: "01", start: 0, end: 5.2, guion: "" }]);

  assert.equal(plans[0].request, 5);
  assert.equal(plans[0].freeze, 0.35);
});

test("por encima de 5,5 sí se paga el clip de diez", () => {
  const plans = planDurations([{ n: "01", start: 0, end: 5.6, guion: "" }]);

  assert.equal(plans[0].request, 10);
  assert.equal(plans[0].freeze, 0);
});

test("una toma de más de diez segundos hay que partirla", () => {
  const plans = planDurations([{ n: "01", start: 0, end: 12, guion: "" }]);

  assert.equal(plans[0].split, true);
  assert.match(plans[0].reason, /pártela|Pártela/);
});

test("el ahorro de la regla es real, no teórico", () => {
  // Cinco tomas de «casi cinco segundos», el caso descrito en el manual.
  const cuts = Array.from({ length: 5 }, (_, index) => ({
    n: String(index + 1).padStart(2, "0"),
    start: 0,
    end: 5.2,
    guion: "",
  }));

  const conRegla = planDurations(cuts).reduce((sum, plan) => sum + plan.request, 0);
  const sinRegla = cuts.length * 10;

  // 25 s contra 50 s: a $0,07/s son $1,75 de diferencia solo en estas cinco.
  assert.equal(conRegla, 25);
  assert.equal(Number(((sinRegla - conRegla) * DEFAULT_RATES.videoPerSecond).toFixed(2)), 1.75);
});

/* -------------------------------- Lipsync ---------------------------------- */

test("solo se lipsyncan las tomas habladas con cara humana", () => {
  const shots = [
    shot({ n: "01", role: "story", speaking: true }),
    shot({ n: "02", role: "science", speaking: true }),
    shot({ n: "03", role: "story", speaking: false }),
  ];
  const cuts = shots.map((item) => ({ n: item.n, start: 0, end: 4, guion: "" }));

  assert.deepEqual(
    lipsyncTargets(shots, cuts).map((target) => target.n),
    ["01"],
  );
});

test("una toma de más de diez segundos no va al lipsync", () => {
  // Es el tope del modelo: hay que partirla por un límite de palabra antes.
  const shots = [shot({ n: "01", role: "story", speaking: true })];

  assert.equal(lipsyncTargets(shots, [{ n: "01", start: 0, end: 11, guion: "" }]).length, 0);
});

/* -------------------------------- Prompts ---------------------------------- */

test("el ancla de estilo va en todos los keyframes", () => {
  /*
   * Es lo único que hace que catorce imágenes generadas por separado parezcan
   * del mismo vídeo. Si alguien la quita, las tomas salen cada una con su luz.
   */
  const anchor = { render: "soft volumetric light, 35mm lens", accent: "warm amber" };

  for (const role of ["story", "science", "producto"] as const) {
    const prompt = keyframePrompt(shot({ role }), anchor);
    assert.ok(prompt.includes("soft volumetric light"), `${role} sin ancla`);
    assert.ok(prompt.includes("warm amber"), `${role} sin acento`);
    assert.ok(prompt.includes("9:16"));
  }
});

test("el prompt de animación pide cámara lenta y anclaje", () => {
  const prompt = motionPrompt(shot());

  assert.ok(prompt.includes("slowly"));
  assert.ok(prompt.includes("grounded"));
});

test("lo negativo ataca el defecto característico del i2v", () => {
  // Objetos flotando y girando en el vacío como un salvapantallas.
  assert.ok(NEGATIVE_PROMPT.includes("floating in void"));
  assert.ok(NEGATIVE_PROMPT.includes("orbiting"));
  assert.ok(NEGATIVE_PROMPT.includes("screensaver"));
});

/* --------------------------------- Coste ----------------------------------- */

test("el presupuesto se puede calcular sin llamar a nadie", () => {
  const shots = Array.from({ length: 6 }, (_, index) =>
    shot({ n: String(index + 1).padStart(2, "0"), guion: "x".repeat(100) }),
  );
  const plans = planDurations(
    shots.map((item) => ({ n: item.n, start: 0, end: 5, guion: "" })),
  );

  const budget = estimate({ shots, plans, lipsyncCount: 1 });

  assert.equal(budget.videoSeconds, 30);
  assert.equal(budget.keyframes, 0.12);
  assert.equal(Number(budget.video.toFixed(2)), 2.1);
  // El vídeo es casi todo el gasto: es donde hay que mirar antes de lanzar.
  assert.ok(budget.video / budget.total > 0.85);
});

/* ------------------------------ Comprobaciones ----------------------------- */

test("avisa de la sigla deletreada sin texto de pantalla", () => {
  const problems = reviewShots([
    shot({ n: "01", guion: "lleva eme ce te y canela", role: "producto" }),
  ]);

  assert.ok(problems.some((problem) => /sigla/.test(problem.problem)));
});

test("no avisa si la toma ya trae su texto de pantalla", () => {
  const problems = reviewShots([
    shot({ n: "01", guion: "lleva eme ce te", sub: "lleva MCT", role: "producto" }),
  ]);

  assert.equal(problems.filter((problem) => /sigla/.test(problem.problem)).length, 0);
});

test("avisa si una toma marcada como hablada no puede lipsyncarse", () => {
  const problems = reviewShots([
    shot({ n: "01", role: "science", speaking: true }),
    shot({ n: "02", role: "producto" }),
  ]);

  assert.ok(problems.some((problem) => /cara con proporciones humanas/.test(problem.problem)));
});

test("avisa si el vídeo no cierra con el producto real", () => {
  /*
   * La regla que más veces se saltó en producción y la que más caro sale: el
   * vídeo termina sin enseñar qué se vende.
   */
  const problems = reviewShots([shot({ n: "01" }), shot({ n: "02", role: "emotion" })]);

  assert.ok(problems.some((problem) => /cierra con el producto real/.test(problem.problem)));
});

test("un guion correcto no genera avisos", () => {
  const problems = reviewShots([
    shot({ n: "01", role: "emotion" }),
    shot({ n: "02", role: "story", speaking: true }),
    shot({ n: "03", role: "producto", scene: "El envase sobre la mesa", motion: "slow push in" }),
  ]);

  assert.deepEqual(problems, []);
});

test("detecta tomas sin escena o sin movimiento", () => {
  const problems = reviewShots([
    shot({ n: "01", scene: "", motion: "" }),
    shot({ n: "02", role: "producto" }),
  ]);

  assert.ok(problems.some((problem) => /no hay keyframe/.test(problem.problem)));
  assert.ok(problems.some((problem) => /flotando en el vacío/.test(problem.problem)));
});

const ANCLA = { render: "soft volumetric light, 35mm lens", accent: "warm amber" };

test("en la toma de producto el envase es el de la referencia, no uno inventado", () => {
  // Sin decirlo, el modelo se inventa un frasco entero con su etiqueta y queda
  // convincente: no se ve que está mal hasta comparar con el bote de verdad.
  const prompt = keyframePrompt(shot({ role: "producto" }), ANCLA, {
    name: "Naturox Metabolic Balance",
    hasReference: true,
  });

  assert.match(prompt, /EXACTLY the one in the attached reference/);
  assert.match(prompt, /do not rewrite the label/);
});

test("sin foto de referencia se pide un frasco liso, no uno con etiqueta inventada", () => {
  // Una etiqueta inventada se lee como real; un frasco liso se ve claramente
  // como pendiente de sustituir.
  const prompt = keyframePrompt(shot({ role: "producto" }), ANCLA, {
    name: "X",
    hasReference: false,
  });

  assert.match(prompt, /no label, no text/);
});

test("las tomas que no son de producto no arrastran nada de eso", () => {
  const prompt = keyframePrompt(shot({ role: "story" }), ANCLA, {
    name: "X",
    hasReference: true,
  });

  assert.ok(!prompt.includes("reference image"));
});

/* --------------------------- El salto de precio ---------------------------- */

test("pasarse medio segundo del umbral dobla el clip", () => {
  // Diez céntimos de voz de más cuestan el doble de vídeo.
  assert.equal(shotCountOption(11, 2).billed, 10, "5,5 s cada una: clips de cinco");
  assert.equal(shotCountOption(12, 2).billed, 20, "6 s cada una: clips de diez");
});

test("diez tomas cuestan más que once, y ese es el fallo que no se ve venir", () => {
  const diez = shotCountOption(60, 10);
  const once = shotCountOption(60, 11);

  assert.equal(diez.billed, 100);
  assert.equal(once.billed, 55);
  assert.ok(once.billed < diez.billed / 1.8, "once tiene que salir casi la mitad");
});

test("los repartos buenos son los que llenan el clip", () => {
  const options = efficientShotCounts(60);
  const shots = options.map((option) => option.shots);

  // Once (5,5 s) y doce (5 s) aprovechan el clip de cinco; seis (10 s) el de diez.
  assert.ok(shots.includes(11));
  assert.ok(shots.includes(6));
  // Ocho tomas de 7,5 s pagan diez y usan siete y medio: tirar dinero.
  assert.ok(!shots.includes(8), "ocho no debería recomendarse");
});

test("el desperdicio se mide contra la voz que hay que cubrir", () => {
  assert.equal(shotCountOption(60, 6).waste, 0);
  assert.equal(shotCountOption(60, 8).waste, 20);
});

test("el umbral es el mismo que usa el plan de duraciones", () => {
  // Si se separaran, la recomendación diría una cosa y el cobro haría otra.
  const plan = planDurations([{ n: "01", start: 0, end: CLIP_THRESHOLD + 0.1, guion: "x" }]);

  assert.equal(plan[0].request, 10);
});

/* ----------------------------- Los animadores ------------------------------ */

const KLING = findVideoModel("kling");
const GROK = findVideoModel("grok");

test("con clips cerrados se sube al que quepa", () => {
  assert.equal(billedSeconds(5.4, KLING.billing), 5);
  assert.equal(billedSeconds(5.6, KLING.billing), 10, "medio segundo de más paga el doble");
});

test("cobrando por segundo no hay salto: se paga lo que dura", () => {
  assert.equal(billedSeconds(5.6, GROK.billing), 6);
  assert.equal(billedSeconds(8.2, GROK.billing), 9);
});

test("pero hay un mínimo, y una toma corta lo paga entero", () => {
  assert.equal(billedSeconds(2, GROK.billing), 6);
});

test("el barato sale unas cuatro veces menos para el mismo anuncio", () => {
  // 60 s de voz en 8 tomas: el caso que salía caro.
  const conKling = shotCountOption(60, 8, KLING.billing);
  const conGrok = shotCountOption(60, 8, GROK.billing);

  const caro = conKling.billed * KLING.usdPerSecond;
  const barato = conGrok.billed * GROK.usdPerSecond;

  assert.ok(barato < caro / 4, `${barato.toFixed(2)} contra ${caro.toFixed(2)}`);
});

test("cobrando por segundo, ocho tomas dejan de ser mala idea", () => {
  // Con clips cerrados, ocho tomas de 7,5 s tiran veinte segundos. Por segundo,
  // no se tira nada y el número de tomas vuelve a ser una decisión de montaje.
  assert.equal(shotCountOption(60, 8, KLING.billing).waste, 20);
  assert.equal(shotCountOption(60, 8, GROK.billing).waste, 4);
});

test("ninguno trae audio sincronizado, y está escrito", () => {
  // El manual lo comprobó: no reciben audio, solo imagen y prompt. La boca buena
  // sale de un pase de lipsync aparte.
  for (const model of VIDEO_MODELS) {
    assert.equal(model.nativeAudio, false, `${model.id} dice traer audio`);
    assert.ok(model.note.length > 30, `${model.id} sin explicar`);
  }
});

test("el tope del modelo se respeta: pedir de más lo rechaza el proveedor", () => {
  // Grok acepta de 6 a 30 segundos; pedir 40 devuelve un error, no un vídeo.
  assert.equal(billedSeconds(40, GROK.billing, GROK.maxSeconds), 30);
  assert.equal(GROK.maxSeconds, 30);
  assert.equal(KLING.maxSeconds, 10);
});

test("cobrando por segundo, una toma se parte solo si pasa del tope del modelo", () => {
  const plan = planDurations(
    [{ n: "01", start: 0, end: 35, guion: "x" }],
    undefined,
    GROK.billing,
    GROK.maxSeconds,
  );

  assert.equal(plan[0].split, true);
  assert.equal(plan[0].request, 30);
});

/* --------------------- Dónde aparece el envase de verdad ------------------- */

test("el envase sale en más tomas que la de producto", () => {
  // Un anuncio mete el frasco en media escena, y en todas esas se inventaba uno.
  assert.equal(showsProduct(shot({ role: "concept", scene: "Amber dropper bottle on a lab bench" })), true);
  assert.equal(showsProduct(shot({ role: "science", scene: "Thyroid glowing above a serum vial" })), true);
  assert.equal(showsProduct(shot({ role: "story", scene: "Mujer con el frasco en la mano" })), true);
});

test("una escena sin envase no arrastra la referencia", () => {
  // Meter la foto del bote donde no pinta nada lo cuela en la escena.
  assert.equal(showsProduct(shot({ role: "story", scene: "Mujer sentada al borde de la cama" })), false);
  assert.equal(showsProduct(shot({ role: "emotion", scene: "Cracked dry soil, wilting lettuce" })), false);
});

test("el nombre del producto en la escena también cuenta", () => {
  const s = shot({ role: "concept", scene: "Naturox sobre la encimera" });

  assert.equal(showsProduct(s, "Naturox Metabolic Balance"), true);
  assert.equal(showsProduct(s, ""), false);
});

test("la toma de producto siempre, diga lo que diga la escena", () => {
  assert.equal(showsProduct(shot({ role: "producto", scene: "algo" })), true);
});

test("en cualquier toma con envase se pide el de la referencia", () => {
  const prompt = keyframePrompt(
    shot({ role: "concept", scene: "Amber dropper bottle beside petri dishes" }),
    ANCLA,
    { name: "Naturox", hasReference: true },
  );

  assert.match(prompt, /EXACTLY the one in the attached reference/);
});

test("y sin foto, ninguna toma dibuja una etiqueta", () => {
  // Un envase inventado con etiqueta legible es peor que uno liso: no se nota
  // que está mal hasta comparar con el bote de verdad.
  const prompt = keyframePrompt(
    shot({ role: "science", scene: "Glowing organ above a serum vial" }),
    ANCLA,
    { name: "X", hasReference: false },
  );

  assert.match(prompt, /no label, no text/);
});
