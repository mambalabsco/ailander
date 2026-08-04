/**
 * Clonar un anuncio que funciona, con mi producto dentro.
 *
 * Probado en `clone.test.ts`. Solo importa el modelo del grafo.
 *
 * ## Qué se clona
 *
 * La **construcción**: cuántas tomas, qué hace cada una, dónde entra el
 * producto, cómo cierra, cada cuánto corta. Eso es lo que hace que un anuncio
 * funcione y es lo que el análisis ya guarda.
 *
 * El vídeo ajeno y su texto no se conservan: se sube, se le sacan fotogramas y
 * audio, se analiza y se borra. **Los fotogramas sí**, por decisión explícita:
 * describir un plano con palabras pierde justo lo que se quería copiar —el
 * encuadre, la luz, dónde cae el sujeto—, y con el fotograma delante la escena
 * nueva se genera con él de referencia.
 *
 * Aun así cada escena se **rehace**, no se recorta y se pega: el fotograma entra
 * como referencia de un generador que dibuja otra cosa, con mi producto y mi
 * cara. Es la diferencia entre copiar la construcción de un anuncio y
 * republicar el de otro.
 *
 * ## La voz es una decisión aparte
 *
 * Y no es de estilo: es de dónde sale. Ver `voicePlan`.
 */

import type { Flow } from "./graph.ts";

/* ------------------------------ Los fotogramas ------------------------------ */

export interface ReferenceFrame {
  url: string;
  /** El segundo del vídeo del que salió. */
  at: number;
}

/**
 * Pone la dirección de cada fotograma en el nodo que la pidió.
 *
 * ## Por qué el modelo pide segundos y no direcciones
 *
 * Porque una dirección de setenta caracteres copiada a mano por un modelo sale
 * mal una de cada pocas veces, y una dirección mal copiada no da error: da un
 * nodo que al ejecutar dice «no se pudo descargar la referencia», con el resto
 * del flujo ya montado.
 *
 * Así que el modelo dice **de qué segundo** quiere el fotograma —un número que
 * ya tiene delante, en la línea de tiempo— y aquí se busca el más cercano. Es
 * el mismo reparto de siempre: el modelo decide, el código resuelve.
 */
export function attachFrames(
  flow: Flow,
  frames: ReferenceFrame[],
): { flow: Flow; missing: string[] } {
  const missing: string[] = [];

  if (frames.length === 0) {
    const asked = flow.nodes.filter(
      (node) => node.type === "archivo" && Number.isFinite(Number(node.settings.frameAt)),
    );

    for (const node of asked) {
      missing.push(`${node.id} pedía un fotograma y ese análisis no guardó ninguno.`);
    }

    return { flow, missing };
  }

  const nodes = flow.nodes.map((node) => {
    if (node.type !== "archivo") return node;

    const wanted = Number(node.settings.frameAt);
    if (!Number.isFinite(wanted)) return node;

    // El más cercano en el tiempo. Con empate gana el primero, que en un
    // anuncio es el que abre el plano y no el que lo cierra.
    const nearest = frames.reduce((best, frame) =>
      Math.abs(frame.at - wanted) < Math.abs(best.at - wanted) ? frame : best,
    );

    return {
      ...node,
      settings: {
        ...node.settings,
        url: nearest.url,
        name: `Fotograma del segundo ${Math.round(nearest.at)}`,
      },
    };
  });

  return { flow: { nodes, edges: flow.edges }, missing };
}

/* ---------------------------------- La voz ---------------------------------- */

export type VoiceSource = "elevenlabs" | "seedance" | "sin-voz";
export type VoicePreference = VoiceSource | "auto";

export const VOICE_CHOICES: { id: VoicePreference; label: string; note: string }[] = [
  {
    id: "auto",
    label: "Que se decida sola",
    note: "Según cómo esté hecho el anuncio y en cuántas piezas se genere.",
  },
  {
    id: "elevenlabs",
    label: "Con mi voz de ElevenLabs",
    note: "La misma voz en todo el anuncio, y se elige cuál.",
  },
  {
    id: "seedance",
    label: "La que ponga el generador",
    note: "Una llamada menos y sale hablando solo. No se elige la voz.",
  },
  { id: "sin-voz", label: "Sin voz", note: "Solo imagen y música." },
];

export interface VoiceDecision {
  source: VoiceSource;
  /** Por qué salió esa, para que se entienda y se pueda cambiar. */
  why: string;
  /** Lo que va a pasar y no gusta, cuando se fuerza a mano. */
  warning: string;
}

/**
 * De dónde sale la voz.
 *
 * ## La regla que importa
 *
 * Un generador de vídeo pone **una voz distinta en cada llamada**. Con el
 * anuncio en una sola pieza da igual: una llamada, una voz. Pero en cuanto son
 * seis planos son seis llamadas, y la persona del anuncio cambia de voz a mitad
 * de frase. No da error, no se ve en la miniatura y no se descubre hasta
 * reproducirlo entero con sonido — con los seis clips ya pagados.
 *
 * Por eso, plano a plano la voz la pone ElevenLabs: una locución para todo el
 * anuncio, la misma de principio a fin y elegida a mano.
 *
 * ## Y por qué se puede forzar igual
 *
 * Porque hay casos —un anuncio de una pieza donde la persona habla a cámara— en
 * los que la voz nativa cuadra los labios y una locución pegada encima no. Se
 * fuerza, pero se avisa de lo que va a pasar.
 */
export function voicePlan(options: {
  /** Si el anuncio se genera de una pieza o plano a plano. */
  shape: "una-pieza" | "planos";
  /** Si el anuncio de referencia llevaba voz. */
  hadAudio: boolean;
  /** Lo que el análisis dijo de la voz, para explicarlo. */
  voiceNote?: string;
  preference?: VoicePreference;
}): VoiceDecision {
  const preference = options.preference ?? "auto";

  if (preference === "sin-voz") {
    return { source: "sin-voz", why: "Lo pediste sin voz.", warning: "" };
  }

  if (preference === "elevenlabs") {
    return {
      source: "elevenlabs",
      why: "Lo pediste con tu voz: la misma en todo el anuncio y elegida a mano.",
      warning:
        options.shape === "una-pieza"
          ? "En una sola pieza el generador mueve los labios a su aire, así que si la persona habla a cámara puede no cuadrar."
          : "",
    };
  }

  if (preference === "seedance") {
    return {
      source: "seedance",
      why: "Lo pediste con la voz del generador.",
      warning:
        options.shape === "planos"
          ? "Cada plano es una llamada y el generador pone una voz distinta en cada una: la voz va a cambiar a mitad del anuncio."
          : "",
    };
  }

  if (!options.hadAudio) {
    return {
      source: "sin-voz",
      why: "El anuncio de referencia no llevaba voz, así que este tampoco.",
      warning: "",
    };
  }

  if (options.shape === "planos") {
    return {
      source: "elevenlabs",
      why: [
        "Son varios planos y cada uno es una llamada al generador, que pone una voz distinta en cada una.",
        "Con una locución aparte, la voz es la misma de principio a fin.",
        options.voiceNote?.trim() ? `El original: ${options.voiceNote.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      warning: "",
    };
  }

  return {
    source: "seedance",
    why: [
      "Es una sola pieza, así que es una sola llamada y la voz no cambia dentro.",
      "Se ahorra la locución y los labios cuadran solos.",
      options.voiceNote?.trim() ? `El original: ${options.voiceNote.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    warning: "",
  };
}

/**
 * Si el flujo montado hace lo que decidió la voz.
 *
 * Se comprueba **después**, porque el que monta es un modelo y lo que se le pide
 * no siempre es lo que devuelve. Un flujo plano a plano sin nodo de voz sale
 * mudo, y eso se descubre al reproducirlo con todo pagado.
 */
export function voiceProblems(flow: Flow, decision: VoiceDecision): string[] {
  const problems: string[] = [];
  const has = (type: string) => flow.nodes.some((node) => node.type === type);

  if (decision.source === "elevenlabs" && !has("voz")) {
    problems.push("La voz iba a ser tuya pero el flujo no tiene nodo de voz: saldría mudo.");
  }

  if (decision.source === "sin-voz" && has("voz")) {
    problems.push("Pediste sin voz y el flujo trae un nodo de voz. Quítalo o cámbialo.");
  }

  if (decision.source === "elevenlabs" && has("voz") && !has("montaje") && !has("clip")) {
    problems.push("Hay voz pero nada que la monte encima del vídeo.");
  }

  return problems;
}

/* -------------------------------- El encargo -------------------------------- */

export interface CloneBeat {
  at: number;
  shot: string;
  role: string;
  onScreenText: string;
}

export interface CloneAnalysis {
  hook: string;
  promise: string;
  voice: string;
  beats: CloneBeat[];
  averageShotSeconds: number;
  productMoment: string;
  callToAction: string;
  whyItWorks: string;
}

/** La línea de tiempo del original, para que las tomas salgan en el mismo sitio. */
export function describeBeats(analysis: CloneAnalysis): string {
  if (analysis.beats.length === 0) return "El análisis no guardó momentos.";

  return analysis.beats
    .map((beat, index) => {
      const next = analysis.beats[index + 1];
      const lasts = next ? Math.max(1, Math.round(next.at - beat.at)) : 0;

      return [
        `${index + 1}. En el segundo ${Math.round(beat.at)}${lasts > 0 ? ` (dura ~${lasts} s)` : ""}`,
        `   Papel: ${beat.role || "sin definir"}`,
        `   Lo que se ve: ${beat.shot || "sin describir"}`,
        beat.onScreenText ? `   Texto en pantalla: ${beat.onScreenText}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/**
 * El encargo de clonar.
 *
 * Se le da la línea de tiempo del original **con sus segundos**, porque lo que
 * se está copiando es el ritmo: un anuncio que corta cada dos segundos y medio
 * y el mismo anuncio cortando cada seis son dos anuncios distintos, aunque digan
 * lo mismo.
 */
export function buildClonePrompt(options: {
  analysis: CloneAnalysis;
  referenceName: string;
  /** El contexto del producto propio, el mismo que usa el resto de la plataforma. */
  context: string;
  /** El catálogo de nodos, ya descrito. */
  nodeMenu: string;
  voice: VoiceDecision;
  videoModels?: { id: string; label: string; note: string }[];
  subtitleStyles?: string[];
  shape: "una-pieza" | "planos";
  seconds?: number;
  aspectRatio?: string;
  /** Si hay caras guardadas que se puedan usar de avatar. */
  avatars?: number;
  /** Cuántos fotogramas del original se guardaron. */
  frames?: number;
}): string {
  const { analysis } = options;

  const lines = [
    "Eres director creativo. Vas a rehacer un anuncio que funciona, con otro producto.",
    "",
    "## Lo que se copia y lo que no",
    "",
    "Se copia la **construcción**: cuántas tomas, qué hace cada una, cada cuánto",
    "corta, dónde entra el producto y cómo cierra.",
    "",
    "No se copia el texto del original. Cada toma se **rehace** con mi producto y",
    "mi gente: mismo papel en la historia, contenido propio. Si el original decía",
    "una cifra, un nombre de marca o un testimonio, no los repitas — escribe el",
    "equivalente para mi producto.",
    "",
    `## Cómo está hecho «${options.referenceName}»`,
    "",
    `Gancho: ${analysis.hook || "sin describir"}`,
    `Promesa: ${analysis.promise || "sin describir"}`,
    `Voz: ${analysis.voice || "sin describir"}`,
    `Momento del producto: ${analysis.productMoment || "sin describir"}`,
    `Cierre: ${analysis.callToAction || "sin describir"}`,
    `Corta cada ${analysis.averageShotSeconds || 0} segundos de media.`,
    analysis.whyItWorks ? `Por qué funciona: ${analysis.whyItWorks}` : "",
    "",
    "### La línea de tiempo",
    "",
    describeBeats(analysis),
    "",
    "## El catálogo de nodos",
    "",
    options.nodeMenu,
    "",
    "## Las reglas del lienzo",
    "",
    "- Una conexión solo vale si lo que produce el origen es del mismo tipo que",
    "  la entrada del destino.",
    "- El `port` es el índice de la entrada en la lista de arriba.",
    "- Las entradas obligatorias tienen que estar conectadas y no puede haber círculos.",
    "- Cada nodo de imagen o de clip necesita un `prompt` conectado, escrito en",
    "  inglés, con encuadre, luz y un solo movimiento de cámara.",
    "- Nada de texto en pantalla, logotipos ni marcas dentro de los prompts: los",
    "  generadores escriben letras deformes y hay que tirar la toma.",
  ];

  if (options.shape === "una-pieza") {
    lines.push(
      "",
      "## La forma",
      "",
      "Una sola pieza: un nodo `anuncio` con el guion entero y la plantilla de",
      "dirección que mejor encaje con el original (`ugc`, `problema-solucion` o",
      "`demo`). Las tomas de arriba se cuentan dentro del guion, no como nodos.",
    );
  } else {
    lines.push(
      "",
      "## La forma",
      "",
      "Plano a plano: un `prompt` y un `clip` por cada momento de la línea de",
      "tiempo, con la duración que tenía ahí, y un `montaje` que los pegue en",
      "orden. Así se puede rehacer solo la toma que salga mal.",
    );
  }

  /*
   * De dónde sale la voz se le dice, no se le pregunta.
   *
   * Es una decisión de coste y de continuidad —una voz distinta por llamada—, no
   * de creatividad, y dejársela al modelo es cómo salen flujos mudos.
   */
  lines.push("", "## La voz", "");

  if (options.voice.source === "elevenlabs") {
    lines.push(
      "La pone una locución aparte: incluye un nodo `voz` alimentado por el guion",
      "o por el copy, y llévalo al montaje. No cuentes con el sonido del",
      "generador de vídeo.",
    );
  } else if (options.voice.source === "seedance") {
    lines.push(
      "La pone el propio generador: deja `sound` en true en el nodo de anuncio y",
      "**no** añadas nodo de voz.",
    );
  } else {
    lines.push("No lleva voz. Ni nodo de `voz`, ni sonido del generador. Música y ya.");
  }

  /*
   * Los fotogramas del original, para que cada toma parta del encuadre que tenía.
   *
   * El modelo pide **el segundo**, no la dirección: una dirección de setenta
   * caracteres copiada a mano sale mal de vez en cuando y no da error — da un
   * nodo que al ejecutar no puede descargar su referencia, con el flujo entero
   * ya montado. El número ya lo tiene delante, en la línea de tiempo.
   */
  if (options.frames && options.frames > 0) {
    lines.push(
      "",
      "## Los fotogramas del original",
      "",
      `Se guardaron ${options.frames}, uno por momento aproximadamente.`,
      "",
      "Para partir del encuadre que tenía una toma, añade un nodo `archivo` con",
      "`settings.frameAt` = el segundo de esa toma, y conéctalo a las referencias",
      "del nodo que la genera. La plataforma pone sola la dirección del fotograma",
      "más cercano a ese segundo — **no escribas direcciones**.",
      "",
      "Úsalo donde el encuadre importe: el gancho, el plano del producto, el",
      "antes y después. En las tomas donde solo importe la idea, no hace falta.",
      "",
      "El fotograma es **referencia de composición**, no de contenido: el prompt",
      "de esa toma tiene que describir mi producto y mi gente, no los suyos.",
    );
  }

  if (options.avatars && options.avatars > 0) {
    lines.push(
      "",
      "## Las caras",
      "",
      `Hay ${options.avatars} cara(s) guardada(s). Si el original sale una persona,`,
      "usa un nodo `avatar` como referencia de las tomas donde aparezca, para que",
      "sea la misma en todo el anuncio. Déjalo sin cara fijada: así el mismo flujo",
      "se ejecuta con varias y salen varios anuncios.",
    );
  } else {
    lines.push(
      "",
      "No hay caras guardadas: si el original lleva una persona, pon igualmente un",
      "nodo `avatar` sin fijar y avísalo en la explicación.",
    );
  }

  if (options.videoModels?.length) {
    lines.push(
      "",
      "## Los generadores que existen",
      "",
      ...options.videoModels.map((model) => `- \`${model.id}\` — ${model.label}. ${model.note}`),
      "",
      "Usa el id literal. Cualquier otro nombre se ignora sin avisar.",
    );
  }

  if (options.subtitleStyles?.length) {
    lines.push("", `Estilos de subtítulos: ${options.subtitleStyles.join(", ")}.`);
  }

  if (options.seconds && options.seconds > 0) {
    lines.push("", `El anuncio nuevo dura unos ${Math.round(options.seconds)} segundos.`);
  }

  if (options.aspectRatio) lines.push(`Formato ${options.aspectRatio}.`);

  lines.push("", options.context.trim());

  // Los huecos de las líneas condicionales se cierran, que si no el encargo sale
  // con agujeros de tres líneas en blanco donde faltaba un dato.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
