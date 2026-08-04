import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFlowPrompt, describeNodeMenu, flowFromPlan, layout, type FlowPlan } from "./build.ts";
import { validate, type Flow } from "./graph.ts";

const plan = (partial: Partial<FlowPlan>): FlowPlan => ({
  nombre: "Prueba",
  explicacion: "",
  nodes: [],
  edges: [],
  ...partial,
});

/* -------------------------------- El encargo -------------------------------- */

test("el catálogo que se le enseña lleva entradas, salida y ajustes", () => {
  const menu = describeNodeMenu();

  assert.match(menu, /\*\*montaje\*\*/);
  assert.match(menu, /entradas →/);
  assert.match(menu, /produce →/);
  assert.match(menu, /ajustes →/);
});

/*
 * Sin la lista de generadores el modelo escribe nombres que no existen aquí, el
 * nodo se queda con el de por defecto y nadie se entera de que se ignoró.
 */
test("los generadores van por su id", () => {
  const prompt = buildFlowPrompt({
    context: "Producto: Naturox",
    videoModels: [{ id: "seedance2", label: "Seedance 2", note: "Hasta 4K", maxSeconds: 15 }],
  });

  assert.match(prompt, /`seedance2`/);
  assert.match(prompt, /id literal/);
});

/*
 * El fallo que salió en producción: se pidieron 50 segundos, Seedance recorta a
 * 15 sin decir nada y mete el guion de 50 dentro. Sale un anuncio acelerado, y
 * no da error en ningún sitio.
 */
test("lo que no cabe en una pieza se dice, no se recorta", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    seconds: 50,
    videoModels: [{ id: "seedance2", label: "Seedance 2", note: "", maxSeconds: 15 }],
  });

  assert.match(prompt, /lo resuelve solo|resuelve solo/);
  assert.match(prompt, /un solo\*\* nodo de anuncio/);
});

test("lo que sí cabe no lleva advertencia", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    seconds: 12,
    videoModels: [{ id: "seedance2", label: "Seedance 2", note: "", maxSeconds: 15 }],
  });

  assert.ok(!prompt.includes("lo\nresuelve solo"));
});

test("cuánto dura cada generador se le dice", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    videoModels: [{ id: "seedance2", label: "Seedance 2", note: "", maxSeconds: 15 }],
  });

  assert.match(prompt, /Hasta 15 s por pieza/);
});

test("la forma pedida cambia lo que se le pide", () => {
  assert.match(buildFlowPrompt({ context: "x", shape: "una-pieza" }), /una vez a partir/);
  assert.match(buildFlowPrompt({ context: "x", shape: "planos" }), /Plano a plano/);
  assert.match(buildFlowPrompt({ context: "x", shape: "elige-tu" }), /Tú eliges/);
});

test("sin idea se le dice que la proponga, no se deja el hueco", () => {
  assert.match(buildFlowPrompt({ context: "x" }), /No hay idea previa/);
  assert.match(buildFlowPrompt({ context: "x", idea: "una madre a las 6am" }), /una madre a las 6am/);
});

test("los ángulos ya investigados entran, y no todos", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    angles: Array.from({ length: 12 }, (_, i) => `angulo-${i}`),
  });

  assert.ok(prompt.includes("angulo-0"));
  assert.ok(!prompt.includes("angulo-9"));
});

/* -------------------------------- El saneado -------------------------------- */

test("un plan bueno sale entero y sin problemas", () => {
  const { flow, dropped } = flowFromPlan(
    plan({
      nodes: [
        { id: "producto-1", type: "producto" },
        { id: "guion-1", type: "guion", settings: { shots: 5 } },
        { id: "voz-1", type: "voz", settings: { voiceId: "abc" } },
      ],
      edges: [
        { from: "producto-1", to: "guion-1", port: 0 },
        { from: "guion-1", to: "voz-1", port: 0 },
      ],
    }),
  );

  assert.equal(flow.nodes.length, 3);
  assert.equal(flow.edges.length, 2);
  assert.deepEqual(dropped, []);
  assert.deepEqual(validate(flow), []);
});

/*
 * Un tipo inventado se guardaría igual y el lienzo pintaría una caja roja que no
 * se puede ejecutar. Mejor que no llegue, y que se diga cuál era.
 */
test("un tipo de nodo inventado se cae y se cuenta", () => {
  const { flow, dropped } = flowFromPlan(
    plan({ nodes: [{ id: "x-1", type: "narrador-3d" }] }),
  );

  assert.equal(flow.nodes.length, 0);
  assert.match(dropped[0], /narrador-3d/);
});

test("dos nodos con el mismo nombre: se queda el primero", () => {
  const { flow, dropped } = flowFromPlan(
    plan({
      nodes: [
        { id: "voz-1", type: "voz", settings: { tone: "cercano" } },
        { id: "voz-1", type: "musica" },
      ],
    }),
  );

  assert.equal(flow.nodes.length, 1);
  assert.equal(flow.nodes[0].type, "voz");
  assert.match(dropped[0], /dos nodos llamados voz-1/);
});

test("una conexión de tipos que no encajan se cae con su motivo", () => {
  const { flow, dropped } = flowFromPlan(
    plan({
      nodes: [
        { id: "musica-1", type: "musica" },
        { id: "imagen-1", type: "imagen" },
      ],
      // Audio a la entrada de prompt: no da error al ejecutar, manda un campo
      // que el modelo ignora.
      edges: [{ from: "musica-1", to: "imagen-1", port: 0 }],
    }),
  );

  assert.equal(flow.edges.length, 0);
  assert.match(dropped[0], /musica-1 → imagen-1/);
});

/*
 * Que una conexión imposible no invalide las demás: se prueban contra el flujo
 * que se lleva montado, no contra el plan entero.
 */
test("lo que se cae no se lleva por delante lo que sí valía", () => {
  const { flow, dropped } = flowFromPlan(
    plan({
      nodes: [
        { id: "producto-1", type: "producto" },
        { id: "guion-1", type: "guion" },
        { id: "musica-1", type: "musica" },
      ],
      edges: [
        { from: "musica-1", to: "guion-1", port: 0 },
        { from: "producto-1", to: "guion-1", port: 0 },
      ],
    }),
  );

  assert.equal(flow.edges.length, 1);
  assert.equal(flow.edges[0].from, "producto-1");
  assert.equal(dropped.length, 1);
});

test("un círculo no se dibuja", () => {
  const { flow, dropped } = flowFromPlan(
    plan({
      nodes: [
        { id: "prompt-1", type: "prompt" },
        { id: "prompt-2", type: "prompt" },
      ],
      edges: [
        { from: "prompt-1", to: "prompt-2", port: 0 },
        { from: "prompt-2", to: "prompt-1", port: 0 },
      ],
    }),
  );

  assert.equal(flow.edges.length, 1);
  assert.match(dropped[0], /círculo/);
});

test("una conexión a un nodo que no existe se cae", () => {
  const { dropped } = flowFromPlan(
    plan({
      nodes: [{ id: "voz-1", type: "voz" }],
      edges: [{ from: "fantasma", to: "voz-1", port: 0 }],
    }),
  );

  assert.equal(dropped.length, 1);
});

test("un puerto que no existe se cae en vez de guardarse", () => {
  const { flow } = flowFromPlan(
    plan({
      nodes: [
        { id: "producto-1", type: "producto" },
        { id: "guion-1", type: "guion" },
      ],
      edges: [{ from: "producto-1", to: "guion-1", port: 7 }],
    }),
  );

  assert.equal(flow.edges.length, 0);
});

/*
 * Un objeto anidado en los ajustes no da error: se guarda, el panel lo pinta
 * como `[object Object]` y el ejecutor lee cadena vacía.
 */
test("los ajustes se quedan en valores planos", () => {
  const { flow } = flowFromPlan(
    plan({
      nodes: [
        {
          id: "clip-1",
          type: "clip",
          settings: { model: "seedance2", seconds: 6, sound: true, camara: { tipo: "dolly" } },
        },
      ],
    }),
  );

  assert.deepEqual(flow.nodes[0].settings, { model: "seedance2", seconds: 6, sound: true });
});

test("un nodo sin identificador no entra", () => {
  const { flow, dropped } = flowFromPlan(plan({ nodes: [{ id: "  ", type: "voz" }] }));

  assert.equal(flow.nodes.length, 0);
  assert.equal(dropped.length, 1);
});

test("un plan vacío da un flujo vacío, no un error", () => {
  const { flow, dropped } = flowFromPlan(plan({}));

  assert.deepEqual(flow, { nodes: [], edges: [] });
  assert.deepEqual(dropped, []);
});

/* -------------------------------- La colocación ----------------------------- */

/*
 * Sin colocar, todas las cajas salen en el mismo punto y hay que separarlas a
 * mano antes de poder leer nada.
 */
test("cada nodo va a la derecha de lo que le da entrada", () => {
  const flow: Flow = {
    nodes: [
      { id: "a", type: "producto", x: 0, y: 0, settings: {} },
      { id: "b", type: "guion", x: 0, y: 0, settings: {} },
      { id: "c", type: "voz", x: 0, y: 0, settings: {} },
    ],
    edges: [
      { from: "a", to: "b", port: 0 },
      { from: "b", to: "c", port: 0 },
    ],
  };

  const placed = layout(flow).nodes;

  assert.ok(placed[0].x < placed[1].x);
  assert.ok(placed[1].x < placed[2].x);
});

test("dos nodos de la misma columna no se pisan", () => {
  const flow: Flow = {
    nodes: [
      { id: "a", type: "archivo", x: 0, y: 0, settings: {} },
      { id: "b", type: "archivo", x: 0, y: 0, settings: {} },
    ],
    edges: [],
  };

  const placed = layout(flow).nodes;

  assert.equal(placed[0].x, placed[1].x);
  assert.notEqual(placed[0].y, placed[1].y);
});

/* Un plan con círculo no tiene orden; colocar mal es mejor que no colocar. */
test("un círculo no cuelga la colocación", () => {
  const flow: Flow = {
    nodes: [
      { id: "a", type: "prompt", x: 0, y: 0, settings: {} },
      { id: "b", type: "prompt", x: 0, y: 0, settings: {} },
    ],
    edges: [
      { from: "a", to: "b", port: 0 },
      { from: "b", to: "a", port: 0 },
    ],
  };

  assert.equal(layout(flow).nodes.length, 2);
});

/*
 * Con un ángulo decidido, enseñarle los otros siete solo le da ocasiones de
 * mezclarlos — y un anuncio con dos ángulos deja los dos a medias.
 */
test("el ángulo elegido manda sobre la lista", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    angles: ["angulo-a", "angulo-b"],
    chosenAngle: "Para quien ya probó colágeno",
  });

  assert.match(prompt, /ya está decidido/);
  assert.match(prompt, /ya probó colágeno/);
  assert.ok(!prompt.includes("angulo-b"));
});

test("sin elegir se enseñan los investigados", () => {
  const prompt = buildFlowPrompt({ context: "x", angles: ["angulo-a"] });

  assert.match(prompt, /Ángulos ya investigados/);
  assert.ok(!prompt.includes("ya está decidido"));
});

/* Los copys probados son la única prueba real de qué frases convierten. */
test("los copys elegidos entran con su nombre", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    copies: [{ label: "Gancho de enero", text: "Me dolían las rodillas" }],
  });

  assert.match(prompt, /### Gancho de enero/);
  assert.match(prompt, /Me dolían las rodillas/);
});

test("se le dice que los adapte a voz alta, no que los copie", () => {
  const prompt = buildFlowPrompt({ context: "x", copies: [{ label: "A", text: "B" }] });

  assert.match(prompt, /en voz alta/);
  assert.match(prompt, /no lo reinventes de cero/);
});

test("sin copys no queda la sección vacía", () => {
  assert.ok(!buildFlowPrompt({ context: "x" }).includes("Copys que ya funcionaron"));
});

/* Cuatro copys largos se comen el encargo entero. */
test("no se mandan todos los copys ni enteros", () => {
  const prompt = buildFlowPrompt({
    context: "x",
    copies: Array.from({ length: 9 }, (_, i) => ({ label: `copy-${i}`, text: "y".repeat(5_000) })),
  });

  assert.ok(prompt.includes("copy-0"));
  assert.ok(!prompt.includes("copy-5"));
  assert.ok(!prompt.includes("y".repeat(2_500)));
});
