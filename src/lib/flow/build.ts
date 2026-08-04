/**
 * Que el flujo lo monte la IA, y luego lo edites tú.
 *
 * Probado en `build.test.ts`. Solo importa el modelo del grafo, así que se puede
 * probar sin navegador y sin llamar a nadie.
 *
 * ## Qué se le pide y qué no
 *
 * Se le pide **el plano**, no el anuncio. El modelo decide cuántas tomas, qué
 * generador para cada una, dónde va la voz y si el montaje lleva subtítulos; y
 * devuelve eso como nodos y conexiones. No genera nada: al terminar hay un
 * lienzo lleno que no ha costado un céntimo, y lo que se ejecuta se decide
 * después, mirándolo.
 *
 * Es lo que separa esto de un botón de «hazme un anuncio»: el punto de edición
 * está **antes** de pagar, no después de ver el resultado.
 *
 * ## Por qué se sanea lo que devuelve
 *
 * Porque un plan casi bueno es peor que uno malo. Si el modelo inventa un tipo
 * de nodo, conecta una voz a la entrada de una imagen o cierra un círculo, el
 * lienzo lo aceptaría sin decir nada y el fallo saldría al ejecutar —con la
 * mitad del flujo ya pagada—. Aquí cada nodo y cada conexión pasan por la misma
 * regla que si las hubiera dibujado una persona, y lo que no pasa se cae **y se
 * cuenta**: un plan recortado en silencio es un plan que no se parece a lo que
 * se pidió y nadie sabe por qué.
 */

import { NODE_TYPES, canConnect, findNodeType, type Flow, type FlowNode } from "./graph.ts";

/* -------------------------------- El encargo -------------------------------- */

/**
 * Qué ajustes entiende cada nodo.
 *
 * Va aquí y no en `graph.ts` porque es información para el modelo, no para el
 * grafo. Sin esto devuelve nodos vacíos que hay que configurar uno a uno, que es
 * justo el trabajo que se quería ahorrar.
 */
const SETTINGS_HINT: Record<string, string> = {
  guion: "shots (3-12), seconds (duración total del vídeo)",
  prompt: "text (el encargo, en inglés, describiendo plano, luz y movimiento)",
  copy: "format (anuncio | voz | gancho), angle (el ángulo en una frase), seconds",
  imagen: "aspectRatio (9:16, 1:1, 16:9…)",
  clip: "model (el id del generador), seconds, aspectRatio, sound (true/false)",
  anuncio: "model, seconds, aspectRatio, sound, director (ugc | problema-solucion | demo)",
  voz: "tone (narrador | cercano | intenso | calmado)",
  musica: "prompt (cómo suena, en español), seconds, level (suave | normal | presente)",
  montaje: "subtitles (el id de un estilo de subtítulos, o vacío)",
  archivo:
    "url (si ya tienes la dirección), frameAt (el segundo del anuncio de referencia del que quieres el fotograma)",
  referencia: "text (el copy o el ángulo, literal), label (de dónde salió)",
  avatar: "avatarId (vacío = la cara de cada vuelta)",
  producto: "ninguno",
};

/** El catálogo tal y como se le enseña al modelo. */
export function describeNodeMenu(): string {
  return NODE_TYPES.map((type) => {
    const inputs =
      type.accepts.length === 0
        ? "sin entradas"
        : type.accepts
            .map(
              (input, index) =>
                `${index}: ${input.label} (${input.kind}${input.required ? "" : ", opcional"}${input.many ? ", admite varias" : ""})`,
            )
            .join("; ");

    return [
      `- **${type.id}** — ${type.note}`,
      `  entradas → ${inputs}`,
      `  produce → ${type.produces}`,
      `  ajustes → ${SETTINGS_HINT[type.id] ?? "ninguno"}`,
    ].join("\n");
  }).join("\n");
}

/** Lo que el modelo tiene que devolver. */
export const FLOW_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nombre", "explicacion", "nodes", "edges"],
  properties: {
    nombre: { type: "string", description: "Un nombre corto para el flujo." },
    explicacion: {
      type: "string",
      description: "Dos o tres frases en español explicando por qué el anuncio va así.",
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type"],
        properties: {
          id: { type: "string", description: "Corto y único: guion-1, clip-2…" },
          type: { type: "string", description: "Uno de los tipos del catálogo." },
          settings: {
            type: "object",
            additionalProperties: true,
            description: "Solo las claves que ese tipo entiende.",
          },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "port"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          port: { type: "number", description: "El índice de la entrada del destino." },
        },
      },
    },
  },
} as const;

export interface FlowPlan {
  nombre: string;
  explicacion: string;
  nodes: { id: string; type: string; settings?: Record<string, unknown> }[];
  edges: { from: string; to: string; port: number }[];
}

/**
 * El encargo de montar el flujo.
 *
 * Se le dan los generadores disponibles **por su id**: sin la lista escribe
 * nombres de modelos que no existen en esta plataforma, y el nodo se queda con
 * el generador por defecto sin avisar de que se ignoró lo que pidió.
 */
export function buildFlowPrompt(options: {
  /** El contexto del producto, el mismo que usa el resto de la plataforma. */
  context: string;
  /** La idea de la persona, si escribió alguna. */
  idea?: string;
  /** Los ángulos ya investigados, para no reinventarlos. */
  angles?: string[];
  /** Los ids de los generadores de vídeo que existen, con lo que dura cada uno. */
  videoModels?: { id: string; label: string; note: string; maxSeconds: number }[];
  /** Los ids de los estilos de subtítulos. */
  subtitleStyles?: string[];
  seconds?: number;
  aspectRatio?: string;
  /** Si se prefiere una sola pieza (Seedance) o planos encadenados. */
  shape?: "una-pieza" | "planos" | "elige-tu";
}): string {
  const lines = [
    "Eres director creativo y montas anuncios en una plataforma de nodos.",
    "",
    "Devuelve el **plano** de un anuncio: qué nodos hay, cómo se conectan y con",
    "qué ajustes. No generas nada — lo va a revisar una persona antes de",
    "ejecutarlo, y por eso importa que quede editable y no que quede listo.",
    "",
    "## El catálogo de nodos",
    "",
    describeNodeMenu(),
    "",
    "## Las reglas del lienzo",
    "",
    "- Una conexión solo vale si lo que produce el origen es del mismo tipo que",
    "  la entrada del destino. Un `audio` no entra en una entrada de `imagen`.",
    "- El índice `port` es la posición de la entrada en la lista de arriba.",
    "- Las entradas obligatorias tienen que estar conectadas.",
    "- No puede haber círculos.",
    "- Todo nodo de imagen o de clip necesita un `prompt` conectado. El prompt se",
    "  escribe en inglés y describe encuadre, luz y un solo movimiento de cámara.",
    "- Nada de texto en pantalla, logotipos ni marcas dentro de los prompts.",
  ];

  if (options.shape === "una-pieza") {
    lines.push(
      "",
      "## La forma",
      "",
      "Una sola pieza: un nodo `anuncio` que lo genere todo de una vez a partir",
      "del guion. Es más barato y más rápido, y el corte lo decide el modelo.",
    );
  } else if (options.shape === "planos") {
    lines.push(
      "",
      "## La forma",
      "",
      "Plano a plano: un `prompt` y un `clip` por toma, una `voz`, una `musica` y",
      "un `montaje` que lo pegue todo. Se controla cada toma por separado y se",
      "puede rehacer solo la que salga mal.",
    );
  } else {
    lines.push(
      "",
      "## La forma",
      "",
      "Tú eliges: una sola pieza con `anuncio` si el producto se cuenta de",
      "seguido, o planos encadenados con `montaje` si hace falta controlar cada",
      "toma. Explica cuál elegiste y por qué.",
    );
  }

  if (options.videoModels?.length) {
    lines.push(
      "",
      "## Los generadores de vídeo que existen",
      "",
      ...options.videoModels.map(
        (model) =>
          `- \`${model.id}\` — ${model.label}. Hasta ${model.maxSeconds} s por pieza. ${model.note}`,
      ),
      "",
      "Usa el id literal. Cualquier otro nombre se ignora.",
    );
  }

  if (options.subtitleStyles?.length) {
    lines.push("", `Estilos de subtítulos: ${options.subtitleStyles.join(", ")}.`);
  }

  if (options.seconds && options.seconds > 0) {
    lines.push("", `El anuncio dura unos ${Math.round(options.seconds)} segundos en total.`);

    /*
     * Lo que ningún generador puede hacer de una vez.
     *
     * Ninguno pasa de quince segundos por pieza. Pedirle cincuenta a uno solo no
     * da error: recorta a quince y le mete cincuenta segundos de guion dentro, y
     * sale el anuncio acelerado. Si no cabe se dice aquí — la salida es encadenar
     * planos, no comprimir la historia.
     */
    const longest = Math.max(0, ...(options.videoModels ?? []).map((model) => model.maxSeconds));

    if (longest > 0 && options.seconds > longest) {
      lines.push(
        "",
        `Ningún generador pasa de ${longest} s por pieza, así que ${Math.round(options.seconds)} s`,
        "**no caben en un solo nodo de anuncio**. Móntalo plano a plano con",
        "`montaje`, o reparte la historia en varios nodos de anuncio encadenados.",
        "Nunca pidas más segundos de los que un generador acepta: los recorta sin",
        "avisar y el anuncio sale acelerado.",
      );
    }
  }

  if (options.aspectRatio) lines.push(`Formato ${options.aspectRatio}.`);

  if (options.angles?.length) {
    lines.push(
      "",
      "## Ángulos ya investigados",
      "",
      ...options.angles.slice(0, 8).map((angle) => `- ${angle}`),
      "",
      "Elige uno y móntalo entero. Mezclar dos ángulos en un anuncio deja los dos a medias.",
    );
  }

  if (options.idea?.trim()) {
    lines.push("", "## La idea de la que partir", "", options.idea.trim());
  } else {
    lines.push(
      "",
      "No hay idea previa: propón tú el ángulo a partir de la investigación del producto.",
    );
  }

  lines.push("", options.context.trim());

  return lines.join("\n");
}

/* -------------------------------- El saneado -------------------------------- */

export interface BuiltFlow {
  flow: Flow;
  /** Lo que se cayó y por qué. Se enseña: un plan recortado en silencio engaña. */
  dropped: string[];
}

/** Los ajustes que se guardan: valores planos y nada más. */
function cleanSettings(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== "object") return {};

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    /*
     * Un objeto anidado aquí no da error: se guarda, el panel lo pinta como
     * `[object Object]` y el ejecutor lee `""`. Mejor que no llegue.
     */
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Convierte el plan del modelo en un flujo que el lienzo acepta.
 *
 * Cada conexión se prueba **contra el flujo que se lleva construido**, no contra
 * el plan entero: así una conexión imposible se cae sola en vez de invalidar las
 * demás, y el resultado es el mejor flujo que se podía sacar de ese plan.
 */
export function flowFromPlan(plan: FlowPlan): BuiltFlow {
  const dropped: string[] = [];
  const nodes: FlowNode[] = [];
  const seen = new Set<string>();

  for (const node of plan.nodes ?? []) {
    const id = String(node?.id ?? "").trim();
    const type = String(node?.type ?? "").trim();

    if (!id) {
      dropped.push("Un nodo venía sin identificador.");
      continue;
    }

    if (!findNodeType(type)) {
      dropped.push(`«${type || "sin tipo"}» no es un tipo de nodo, así que ${id} se cayó.`);
      continue;
    }

    if (seen.has(id)) {
      dropped.push(`Había dos nodos llamados ${id}; se quedó el primero.`);
      continue;
    }

    seen.add(id);
    nodes.push({ id, type, x: 0, y: 0, settings: cleanSettings(node.settings) });
  }

  const flow: Flow = { nodes, edges: [] };

  for (const edge of plan.edges ?? []) {
    const from = String(edge?.from ?? "").trim();
    const to = String(edge?.to ?? "").trim();
    const port = Number(edge?.port);

    const verdict = canConnect(flow, from, to, Number.isFinite(port) ? port : -1);

    if (!verdict.ok) {
      dropped.push(`${from} → ${to}: ${verdict.why}`);
      continue;
    }

    flow.edges.push({ from, to, port: Number(port) });
  }

  return { flow: layout(flow), dropped };
}

/**
 * Dónde va cada caja.
 *
 * Por profundidad: un nodo va a la derecha de todos los que le dan entrada. Es
 * lo que hace que el flujo se lea de izquierda a derecha como se ejecuta, sin
 * que nadie tenga que ordenarlo a mano — y sin esto todas las cajas salen
 * apiladas en el mismo punto.
 */
export function layout(flow: Flow): Flow {
  const depth = new Map<string, number>();

  /*
   * Se repite hasta que nada cambia en vez de ordenar topológicamente: un plan
   * con un círculo no tiene orden, y aquí colocar mal es preferible a no
   * colocar. El tope de vueltas es el número de nodos, que es el camino más
   * largo posible sin círculos.
   */
  for (let pass = 0; pass < flow.nodes.length; pass += 1) {
    let moved = false;

    for (const edge of flow.edges) {
      const next = (depth.get(edge.from) ?? 0) + 1;

      if (next > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, next);
        moved = true;
      }
    }

    if (!moved) break;
  }

  const used = new Map<number, number>();

  return {
    edges: flow.edges,
    nodes: flow.nodes.map((node) => {
      const column = depth.get(node.id) ?? 0;
      const row = used.get(column) ?? 0;

      used.set(column, row + 1);

      return { ...node, x: 60 + column * 280, y: 60 + row * 210 };
    }),
  };
}
