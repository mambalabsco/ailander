import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_FRAMES,
  asScriptReference,
  buildAnalysisPrompt,
  framePlan,
  reviewAnalysis,
  type VideoAnalysis,
} from "./analysis.ts";

/* --------------------------- Qué fotogramas mirar -------------------------- */

test("los tres primeros segundos van muestreados a medio segundo", () => {
  // Es donde se decide si el anuncio se ve: con un fotograma por segundo, un
  // corte en el 1,5 no se ve.
  const marks = framePlan(60);

  assert.deepEqual(marks.slice(0, 7), [0, 0.5, 1, 1.5, 2, 2.5, 3]);
});

test("el resto se reparte y nunca se pasa del tope", () => {
  const marks = framePlan(60);

  assert.equal(marks.length, MAX_FRAMES);
  assert.ok(marks.every((mark, index) => index === 0 || mark > marks[index - 1]), "van en orden");
});

test("el último no cae en el segundo exacto del final", () => {
  // Muchos codificadores no tienen fotograma ahí y sale negro o no sale.
  const marks = framePlan(10);

  assert.ok(marks[marks.length - 1] <= 9.9, `salió ${marks[marks.length - 1]}`);
});

test("un vídeo cortísimo no se sale de su propia duración", () => {
  const marks = framePlan(2);

  assert.ok(marks.every((mark) => mark < 2), `se salió: ${marks.join(", ")}`);
  assert.ok(marks.length > 0);
});

test("una duración imposible no devuelve fotogramas en vez de reventar", () => {
  assert.deepEqual(framePlan(0), []);
  assert.deepEqual(framePlan(Number.NaN), []);
  assert.deepEqual(framePlan(-5), []);
});

/* --------------------------------- El prompt ------------------------------- */

test("el prompt dice en qué segundo va cada fotograma", () => {
  // Sin eso, el modelo no puede situar los momentos en el tiempo.
  const prompt = buildAnalysisPrompt({ duration: 30, marks: [0, 1.5, 3], transcript: "Hola." });

  assert.match(prompt, /0\.0, 1\.5, 3\.0/);
  assert.match(prompt, /30\.0 segundos/);
  assert.match(prompt, /Hola\./);
});

test("sin transcripción lo dice, en vez de callar", () => {
  const prompt = buildAnalysisPrompt({ duration: 10, marks: [0], transcript: "" });

  assert.match(prompt, /No hay voz/);
});

/* --------------------------------- El repaso ------------------------------- */

function analisis(over: Partial<VideoAnalysis> = {}): VideoAnalysis {
  return {
    hook: "Primer plano de unas manos apretando una rodilla hinchada mientras una voz cuenta que lleva años así.",
    promise: "Moverse sin dolor en tres semanas.",
    voice: "Una clienta de unos cincuenta, hablando a cámara.",
    beats: [
      { at: 0, shot: "manos en la rodilla", role: "gancho", onScreenText: "" },
      { at: 4, shot: "cocina, hablando a cámara", role: "problema", onScreenText: "" },
    ],
    averageShotSeconds: 2.5,
    productMoment: "Aparece en el segundo 22, sobre la mesa.",
    callToAction: "Pide entrar por el enlace de la biografía.",
    whyItWorks: "Empieza por el síntoma y no por el producto.",
    ...over,
  };
}

test("un momento fuera del vídeo se caza", () => {
  const { ok, warnings } = reviewAnalysis(
    analisis({ beats: [{ at: 90, shot: "x", role: "cierre", onScreenText: "" }] }),
    30,
  );

  assert.equal(ok, false);
  assert.match(warnings.join(" "), /fuera del vídeo/);
});

test("los momentos desordenados también", () => {
  const { warnings } = reviewAnalysis(
    analisis({
      beats: [
        { at: 10, shot: "a", role: "problema", onScreenText: "" },
        { at: 2, shot: "b", role: "gancho", onScreenText: "" },
      ],
    }),
    30,
  );

  assert.match(warnings.join(" "), /orden/);
});

test("un ritmo imposible avisa por los dos lados", () => {
  assert.match(
    reviewAnalysis(analisis({ averageShotSeconds: 0.2 }), 30).warnings.join(" "),
    /de más/,
  );
  assert.match(
    reviewAnalysis(analisis({ averageShotSeconds: 40 }), 30).warnings.join(" "),
    /de menos/,
  );
});

test("un gancho de tres palabras no sirve para escribir otro", () => {
  const { warnings } = reviewAnalysis(analisis({ hook: "Un gancho potente." }), 30);

  assert.match(warnings.join(" "), /gancho/);
});

test("un análisis correcto pasa sin avisos", () => {
  assert.deepEqual(reviewAnalysis(analisis(), 30), { ok: true, warnings: [] });
});

/* ---------------------------- Volver a usarlo ------------------------------ */

test("la referencia lleva la construcción y prohíbe el texto", () => {
  const reference = asScriptReference(analisis(), "Anuncio rodilla");

  assert.match(reference, /Anuncio rodilla/);
  assert.match(reference, /0\.0s · gancho/);
  assert.match(reference, /cada 2\.5 s/);
  // La línea que impide que se convierta en una copia.
  assert.match(reference, /ni una frase, ni un dato, ni un ingrediente/i);
});
