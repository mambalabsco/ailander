import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VOICE_CHOICES,
  attachFrames,
  buildClonePrompt,
  describeBeats,
  voicePlan,
  voiceProblems,
  type CloneAnalysis,
} from "./clone.ts";
import type { Flow } from "./graph.ts";

const ANALISIS: CloneAnalysis = {
  hook: "Una mujer se levanta y no puede apoyar el pie",
  promise: "Volver a caminar sin pensarlo",
  voice: "Voz femenina en off, cercana, sin música al principio",
  beats: [
    { at: 0, shot: "Pies bajando de la cama", role: "gancho", onScreenText: "" },
    { at: 3, shot: "Primer plano de la cara", role: "problema", onScreenText: "¿Te pasa?" },
    { at: 9, shot: "El bote sobre la mesa", role: "producto", onScreenText: "" },
  ],
  averageShotSeconds: 3,
  productMoment: "En el segundo 9",
  callToAction: "Enlace en el perfil",
  whyItWorks: "Empieza dentro de la escena, sin presentación",
};

const flow = (types: string[]): Flow => ({
  nodes: types.map((type, index) => ({
    id: `${type}-${index}`,
    type,
    x: 0,
    y: 0,
    settings: {},
  })),
  edges: [],
});

/* ---------------------------------- La voz ---------------------------------- */

/*
 * La regla que importa: el generador pone una voz distinta en cada llamada. Con
 * seis planos son seis llamadas y la persona cambia de voz a mitad de frase — y
 * eso no se descubre hasta reproducirlo entero, con los seis clips pagados.
 */
test("plano a plano, la voz la pone ElevenLabs", () => {
  const plan = voicePlan({ shape: "planos", hadAudio: true });

  assert.equal(plan.source, "elevenlabs");
  assert.match(plan.why, /voz distinta en cada una/);
});

test("de una pieza vale la del generador: una llamada, una voz", () => {
  assert.equal(voicePlan({ shape: "una-pieza", hadAudio: true }).source, "seedance");
});

/*
 * El error que salió en el vídeo: «de una pieza» dejó de significar «una
 * llamada» en cuanto el nodo de anuncio empezó a partir lo que no cabe. Cuatro
 * tramos son cuatro voces distintas dentro del mismo anuncio.
 */
test("una sola pieza que se parte en tramos también necesita locución", () => {
  const plan = voicePlan({ shape: "una-pieza", hadAudio: true, pieces: 4 });

  assert.equal(plan.source, "elevenlabs");
  assert.match(plan.why, /4 llamadas/);
});

test("forzar el generador con varios tramos avisa con el número", () => {
  const plan = voicePlan({ shape: "una-pieza", hadAudio: true, pieces: 3, preference: "seedance" });
  assert.match(plan.warning, /3 llamadas/);
});

test("si el original no llevaba voz, este tampoco", () => {
  const plan = voicePlan({ shape: "planos", hadAudio: false });

  assert.equal(plan.source, "sin-voz");
  assert.match(plan.why, /no llevaba voz/);
});

test("lo que se pide a mano manda sobre lo que se deduce", () => {
  assert.equal(
    voicePlan({ shape: "una-pieza", hadAudio: true, preference: "elevenlabs" }).source,
    "elevenlabs",
  );
  assert.equal(
    voicePlan({ shape: "planos", hadAudio: false, preference: "seedance" }).source,
    "seedance",
  );
});

/* Forzar está permitido; callarse lo que va a pasar, no. */
test("forzar el generador con varios planos avisa de que la voz cambiará", () => {
  const plan = voicePlan({ shape: "planos", hadAudio: true, preference: "seedance" });

  assert.equal(plan.source, "seedance");
  assert.match(plan.warning, /va a cambiar/);
});

test("forzar la locución en una pieza avisa de los labios", () => {
  const plan = voicePlan({ shape: "una-pieza", hadAudio: true, preference: "elevenlabs" });
  assert.match(plan.warning, /labios/);
});

test("lo que se decide solo no lleva aviso", () => {
  assert.equal(voicePlan({ shape: "planos", hadAudio: true }).warning, "");
  assert.equal(voicePlan({ shape: "una-pieza", hadAudio: true }).warning, "");
});

test("sin voz a petición no discute", () => {
  const plan = voicePlan({ shape: "planos", hadAudio: true, preference: "sin-voz" });

  assert.equal(plan.source, "sin-voz");
  assert.equal(plan.warning, "");
});

test("lo que dijo el análisis de la voz se cuenta", () => {
  const plan = voicePlan({ shape: "planos", hadAudio: true, voiceNote: "femenina en off" });
  assert.match(plan.why, /femenina en off/);
});

test("todas las opciones de voz se explican", () => {
  for (const choice of VOICE_CHOICES) {
    assert.ok(choice.label && choice.note, choice.id);
  }
});

/* ---------------------------- El repaso del flujo --------------------------- */

/*
 * Lo que se le pide a un modelo no siempre es lo que devuelve. Un flujo plano a
 * plano sin nodo de voz sale mudo, y eso se descubre al reproducirlo con todo
 * pagado.
 */
test("un flujo que iba a llevar mi voz y no la tiene se avisa", () => {
  const problems = voiceProblems(flow(["clip", "montaje"]), {
    source: "elevenlabs",
    why: "",
    warning: "",
  });

  assert.equal(problems.length, 1);
  assert.match(problems[0], /mudo/);
});

test("un flujo con voz cuando se pidió sin voz también", () => {
  const problems = voiceProblems(flow(["voz", "montaje"]), {
    source: "sin-voz",
    why: "",
    warning: "",
  });

  assert.match(problems[0], /sin voz/);
});

test("un flujo coherente no da nada", () => {
  assert.deepEqual(
    voiceProblems(flow(["voz", "clip", "montaje"]), {
      source: "elevenlabs",
      why: "",
      warning: "",
    }),
    [],
  );

  assert.deepEqual(
    voiceProblems(flow(["anuncio"]), { source: "seedance", why: "", warning: "" }),
    [],
  );
});

/* ------------------------------ La línea de tiempo -------------------------- */

/*
 * Lo que se copia es el ritmo: el mismo anuncio cortando cada 2,5 s y cada 6 s
 * son dos anuncios distintos aunque digan lo mismo.
 */
test("cada momento lleva su segundo y cuánto dura", () => {
  const texto = describeBeats(ANALISIS);

  assert.match(texto, /En el segundo 0 \(dura ~3 s\)/);
  assert.match(texto, /En el segundo 3 \(dura ~6 s\)/);
});

test("el último no inventa una duración", () => {
  const texto = describeBeats(ANALISIS);
  assert.match(texto, /En el segundo 9\n/);
});

test("un análisis sin momentos lo dice en vez de quedarse en blanco", () => {
  assert.match(describeBeats({ ...ANALISIS, beats: [] }), /no guardó momentos/);
});

/* -------------------------------- El encargo -------------------------------- */

const encargo = (extra: Partial<Parameters<typeof buildClonePrompt>[0]> = {}) =>
  buildClonePrompt({
    analysis: ANALISIS,
    referenceName: "Anuncio de rodillas",
    context: "Producto: Naturox",
    nodeMenu: "- **clip** — anima",
    voice: voicePlan({ shape: "planos", hadAudio: true }),
    shape: "planos",
    ...extra,
  });

test("se le dice que copie la construcción y no el texto", () => {
  const prompt = encargo();

  assert.match(prompt, /construcción/);
  assert.match(prompt, /No se copia el texto del original/);
});

test("la línea de tiempo del original va dentro", () => {
  assert.match(encargo(), /Pies bajando de la cama/);
});

/*
 * De dónde sale la voz se le dice, no se le pregunta: es una decisión de coste y
 * de continuidad, y dejársela al modelo es cómo salen flujos mudos.
 */
test("la fuente de la voz se le impone", () => {
  assert.match(encargo(), /incluye un nodo `voz`/);

  assert.match(
    encargo({ voice: voicePlan({ shape: "una-pieza", hadAudio: true }), shape: "una-pieza" }),
    /no\*\* añadas nodo de voz/,
  );

  assert.match(
    encargo({ voice: voicePlan({ shape: "planos", hadAudio: false }) }),
    /No lleva voz/,
  );
});

test("con caras guardadas se pide el avatar sin fijar", () => {
  const prompt = encargo({ avatars: 4 });

  assert.match(prompt, /4 cara\(s\) guardada/);
  assert.match(prompt, /sin cara fijada/);
});

test("sin caras guardadas se avisa en vez de callarlo", () => {
  assert.match(encargo({ avatars: 0 }), /No hay caras guardadas/);
});

test("los generadores van por su id", () => {
  const prompt = encargo({
    videoModels: [{ id: "seedance2", label: "Seedance 2", note: "4K" }],
  });

  assert.match(prompt, /`seedance2`/);
});

test("la forma cambia lo que se pide", () => {
  assert.match(encargo({ shape: "planos" }), /Plano a plano/);
  assert.match(
    encargo({ shape: "una-pieza", voice: voicePlan({ shape: "una-pieza", hadAudio: true }) }),
    /Una sola pieza/,
  );
});

test("el encargo no sale con agujeros de líneas en blanco", () => {
  assert.ok(!/\n\n\n/.test(encargo()));
});

/* ------------------------------ Los fotogramas ------------------------------ */

const FRAMES = [
  { url: "https://cdn/0.jpg", at: 0 },
  { url: "https://cdn/3.jpg", at: 3 },
  { url: "https://cdn/9.jpg", at: 9 },
];

const conFrameAt = (at: unknown): Flow => ({
  nodes: [{ id: "archivo-1", type: "archivo", x: 0, y: 0, settings: { frameAt: at } }],
  edges: [],
});

/*
 * El modelo pide el segundo y no la dirección: una dirección de setenta
 * caracteres copiada a mano sale mal de vez en cuando, y no da error — da un
 * nodo que al ejecutar no puede descargar su referencia.
 */
test("cada nodo se queda con el fotograma más cercano a su segundo", () => {
  const { flow } = attachFrames(conFrameAt(8), FRAMES);

  assert.equal(flow.nodes[0].settings.url, "https://cdn/9.jpg");
  assert.match(String(flow.nodes[0].settings.name), /segundo 9/);
});

test("un segundo exacto coge el suyo", () => {
  assert.equal(attachFrames(conFrameAt(3), FRAMES).flow.nodes[0].settings.url, "https://cdn/3.jpg");
});

test("un segundo más allá del vídeo coge el último", () => {
  assert.equal(attachFrames(conFrameAt(90), FRAMES).flow.nodes[0].settings.url, "https://cdn/9.jpg");
});

test("un nodo de imagen sin fotograma pedido no se toca", () => {
  const flow: Flow = {
    nodes: [{ id: "archivo-1", type: "archivo", x: 0, y: 0, settings: { url: "https://mia/1.jpg" } }],
    edges: [],
  };

  assert.equal(attachFrames(flow, FRAMES).flow.nodes[0].settings.url, "https://mia/1.jpg");
});

test("lo que no es un número no se interpreta como el segundo cero", () => {
  const { flow } = attachFrames(conFrameAt("el gancho"), FRAMES);
  assert.equal(flow.nodes[0].settings.url, undefined);
});

/*
 * Un análisis viejo no guardó fotogramas. Dejar los nodos vacíos en silencio da
 * un flujo que falla al ejecutar, a mitad y con lo anterior pagado.
 */
test("sin fotogramas guardados se dice, no se deja el nodo vacío", () => {
  const { flow, missing } = attachFrames(conFrameAt(3), []);

  assert.equal(flow.nodes[0].settings.url, undefined);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /no guardó ninguno/);
});

test("sin fotogramas y sin nodos que los pidan no se avisa de nada", () => {
  assert.deepEqual(attachFrames({ nodes: [], edges: [] }, []).missing, []);
});

test("las conexiones no se tocan al poner los fotogramas", () => {
  const flow: Flow = {
    nodes: [
      { id: "archivo-1", type: "archivo", x: 0, y: 0, settings: { frameAt: 0 } },
      { id: "imagen-1", type: "imagen", x: 0, y: 0, settings: {} },
    ],
    edges: [{ from: "archivo-1", to: "imagen-1", port: 1 }],
  };

  assert.deepEqual(attachFrames(flow, FRAMES).flow.edges, flow.edges);
});

test("con fotogramas se le explica cómo pedirlos, sin direcciones", () => {
  const prompt = encargo({ frames: 12 });

  assert.match(prompt, /se guardaron 12/i);
  assert.match(prompt, /frameAt/);
  assert.match(prompt, /no escribas direcciones/i);
});

/* El fotograma dice cómo se encuadra, no qué sale dentro. */
test("se aclara que el fotograma es composición y no contenido", () => {
  assert.match(encargo({ frames: 5 }), /referencia de composición/);
});

test("sin fotogramas no se habla de ellos", () => {
  assert.ok(!encargo({ frames: 0 }).includes("frameAt"));
});
