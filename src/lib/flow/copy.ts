/**
 * El nodo que escribe copy dentro del lienzo.
 *
 * Sin imports, probado en `copy.test.ts`.
 *
 * ## Por qué un nodo y no la pantalla de copys
 *
 * La pantalla de copys escribe campañas enteras: una tanda de conjuntos con sus
 * anuncios, para revisarla y aprobarla. Aquí hace falta lo contrario — **un**
 * texto, el de este anuncio, en el sitio donde ya está el resto de la cadena y
 * enchufado a lo que viene después.
 *
 * Sin él, la única forma de meter texto en un flujo es teclearlo a mano en un
 * nodo de prompt, y entonces el copy no sabe nada del producto: ni del avatar,
 * ni de la oferta, ni de los ángulos que ya se investigaron.
 *
 * ## Qué produce
 *
 * Texto, no una ficha. Lo que sale se conecta a la voz, al guion como copy de
 * referencia, o al anuncio de una pieza. Por eso `renderCopy` aplana la
 * respuesta a algo que se puede leer y locutar: una ficha con campos sería un
 * tipo nuevo que solo entendería un nodo.
 */

export type CopyFormat = "anuncio" | "voz" | "gancho";

export interface CopyFormatSpec {
  id: CopyFormat;
  label: string;
  note: string;
}

export const COPY_FORMATS: CopyFormatSpec[] = [
  {
    id: "anuncio",
    label: "Anuncio de Meta",
    note: "Texto principal, titular y descripción, como se pegan en el anuncio.",
  },
  {
    id: "voz",
    label: "Locución",
    note: "Lo que se dice en el vídeo, corrido y sin acotaciones.",
  },
  {
    id: "gancho",
    label: "Solo el gancho",
    note: "La primera frase. Para probar diez aperturas del mismo anuncio.",
  },
];

export function findCopyFormat(id: string): CopyFormatSpec {
  return COPY_FORMATS.find((format) => format.id === id) ?? COPY_FORMATS[0];
}

/** Lo que el modelo devuelve. Los campos vacíos son legítimos según el formato. */
export const FLOW_COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["texto"],
  properties: {
    texto: {
      type: "string",
      description:
        "El cuerpo. En «anuncio» es el texto principal; en «voz» es lo que se locuta; en «gancho» es la frase sola.",
    },
    titular: { type: "string", description: "El titular, solo en formato anuncio." },
    descripcion: { type: "string", description: "La descripción, solo en formato anuncio." },
  },
} as const;

export interface FlowCopy {
  texto: string;
  titular?: string;
  descripcion?: string;
}

/**
 * Lo que baja por el cable.
 *
 * Para locutar se manda **solo el cuerpo**: leer en voz alta «Titular: …» es
 * exactamente el fallo silencioso de siempre —no da error, sale un anuncio en el
 * que una voz lee los nombres de los campos—. El titular y la descripción viajan
 * como copy escrito, que es donde tienen sentido.
 */
export function renderCopy(copy: FlowCopy, format: CopyFormat): string {
  if (format !== "anuncio") return copy.texto.trim();

  return [copy.texto, copy.titular, copy.descripcion]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Solo lo que se dice, para cuando esto alimenta una voz. */
export function spokenPart(copy: FlowCopy): string {
  return copy.texto.trim();
}

/**
 * El encargo.
 *
 * Recibe el contexto del producto ya montado —el mismo que usa el resto de la
 * plataforma— para que el nodo no tenga su propia idea de qué es el producto.
 * Dos descripciones distintas del mismo producto en dos sitios es cómo empiezan
 * los anuncios que se contradicen.
 */
export function buildFlowCopyPrompt(options: {
  context: string;
  format: CopyFormat;
  /** El ángulo elegido, o lo que llegue por el cable de arriba. */
  angle?: string;
  language?: string;
  /** Cuántos segundos dura el vídeo, cuando esto se va a locutar. */
  seconds?: number;
}): string {
  const format = findCopyFormat(options.format);

  const lines = [
    "Eres redactor de respuesta directa para suplementos.",
    "",
    `Escribe ${format.label.toLowerCase()} para el producto de abajo, en ${options.language || "español"}.`,
    "",
    "## Cómo se escribe",
    "",
    "- Habla de lo que le pasa a la persona, no de lo que lleva el producto.",
    "- Frases cortas. Nada de subordinadas de tres líneas.",
    "- Sin exclamaciones, sin mayúsculas de grito y sin emojis.",
    "- Nada de promesas médicas: ni curar, ni eliminar, ni garantizar resultados.",
  ];

  if (options.format === "anuncio") {
    lines.push(
      "",
      "## El formato",
      "",
      "- Texto principal: entre 60 y 120 palabras. Empieza por el problema.",
      "- Titular: máximo 40 caracteres.",
      "- Descripción: máximo 30 caracteres.",
    );
  }

  if (options.format === "voz") {
    const seconds = options.seconds && options.seconds > 0 ? Math.round(options.seconds) : 0;

    lines.push(
      "",
      "## El formato",
      "",
      "Es para leerlo en voz alta. Solo lo que se dice: ni acotaciones, ni",
      "nombres de plano, ni indicaciones entre paréntesis.",
    );

    /*
     * Los segundos se traducen a palabras, no se mandan tal cual.
     *
     * «Que dure veinte segundos» no le dice nada a un modelo que no cronometra.
     * A ritmo de locución publicitaria en español son unas 2,5 palabras por
     * segundo; con el número de palabras delante, el texto sale de la longitud
     * que cabe — y no hay que recortarlo después, que es cuando se cae el
     * cierre.
     */
    if (seconds > 0) {
      lines.push(
        "",
        `Dura ${seconds} segundos: unas ${Math.round(seconds * 2.5)} palabras. No te pases.`,
      );
    }
  }

  if (options.format === "gancho") {
    lines.push(
      "",
      "## El formato",
      "",
      "Una sola frase, de menos de quince palabras. Tiene que funcionar sin nada",
      "delante: es lo primero que se oye y se ve.",
    );
  }

  if (options.angle?.trim()) {
    lines.push("", "## El ángulo por el que va", "", options.angle.trim());
  }

  lines.push("", options.context.trim());

  return lines.join("\n");
}
