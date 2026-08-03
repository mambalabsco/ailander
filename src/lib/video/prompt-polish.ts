/**
 * Reescribir a prompt de vídeo lo que uno teclea a mano.
 *
 * Sin imports, probado en `prompt-polish.test.ts`.
 *
 * ## Qué problema resuelve
 *
 * Un generador de vídeo no entiende intenciones, entiende planos. «que se vea
 * bonito el producto» no le dice nada; «close-up, bottle centred, slow push-in,
 * warm morning light» le dice exactamente qué renderizar. La distancia entre las
 * dos frases es lo que cuesta un clip fallido, y son varios dólares cada vez.
 *
 * Traducir de una a otra es justo lo que hace bien un modelo de lenguaje, así
 * que aquí solo va **cómo pedírselo**: qué debe conservar, qué debe añadir y qué
 * no debe inventarse.
 *
 * ## Lo que no puede tocar
 *
 * El sujeto. Si el encargo dice «el frasco de Naturox sobre mármol», el prompt
 * mejorado sigue siendo eso con más detalle de cámara y de luz — no un frasco
 * genérico en un estudio. Un prompt precioso que cambia el producto sirve de
 * menos que el original.
 */

/** Lo que el modelo tiene que devolver. */
export const POLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "cambios"],
  properties: {
    prompt: {
      type: "string",
      description: "El prompt reescrito, en inglés, listo para copiar.",
    },
    cambios: {
      type: "string",
      description: "Una frase en español diciendo qué se le añadió y por qué.",
    },
  },
} as const;

export interface PolishedPrompt {
  prompt: string;
  cambios: string;
}

/**
 * El encargo, con el contexto que haya.
 *
 * Se le dan el modelo y la duración porque cambian la respuesta: en seis
 * segundos cabe **un** movimiento de cámara, y pedir tres hace que el clip salga
 * atropellado. Y un modelo de solo texto necesita que el prompt describa también
 * el sujeto, que en los de imagen ya viene dado por la foto.
 */
export function polishPrompt(options: {
  /** Lo que escribió la persona. */
  draft: string;
  /** Cómo se llama el generador, para adaptar el consejo. */
  modelLabel?: string;
  /** Si parte de una imagen: entonces no hay que describir el sujeto. */
  fromImage?: boolean;
  seconds?: number;
  /** De qué va el producto, si se sabe. */
  context?: string;
}): string {
  const seconds = options.seconds && options.seconds > 0 ? Math.round(options.seconds) : 0;

  const lines = [
    "Eres director de fotografía y escribes prompts para generadores de vídeo.",
    "",
    "Reescribe el encargo de abajo como un prompt de vídeo en INGLÉS, en una sola",
    "frase densa, con términos de cámara y de luz concretos.",
    "",
    "## Lo que no puedes cambiar",
    "",
    "El sujeto y lo que pasa. Se describe mejor, no se sustituye. Si el encargo",
    "nombra un producto, una marca o una persona, siguen siendo esos.",
    "",
    "## Lo que tienes que añadir",
    "",
    "- Encuadre: plano y ángulo (close-up, medium shot, low angle…).",
    "- Movimiento de cámara, uno solo y despacio.",
    "- Luz: dirección, dureza y temperatura.",
    "- Textura y acabado: película, digital limpio, grano…",
    "",
    "## Lo que no puedes inventar",
    "",
    "Texto en pantalla, logotipos, marcas ni frases habladas. Los generadores",
    "escriben letras deformes y arruinan la toma.",
  ];

  if (options.fromImage) {
    lines.push(
      "",
      "El vídeo parte de una imagen que ya existe, así que **no describas el",
      "sujeto ni el decorado**: eso ya está resuelto. Habla solo de cómo se mueven",
      "la cámara y lo que hay dentro del plano.",
    );
  } else {
    lines.push(
      "",
      "No hay imagen de partida, así que el prompt tiene que describir también el",
      "sujeto y el decorado con detalle: es lo único que va a ver el generador.",
    );
  }

  if (seconds > 0) {
    lines.push(
      "",
      `El clip dura ${seconds} segundos.`,
      seconds <= 6
        ? "Es muy poco: un solo movimiento y un solo momento. Nada de secuencias."
        : "Cabe un movimiento con algo de recorrido, pero sigue siendo un solo plano.",
    );
  }

  if (options.modelLabel) lines.push("", `Se va a generar con ${options.modelLabel}.`);
  if (options.context?.trim()) lines.push("", `Contexto del producto: ${options.context.trim()}`);

  lines.push("", "## El encargo", "", options.draft.trim());

  return lines.join("\n");
}
