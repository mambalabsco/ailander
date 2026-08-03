/**
 * El catálogo de generadores de vídeo, con los campos que espera cada uno.
 *
 * Sin imports, probado en `catalog.test.ts`.
 *
 * ## Por qué esto es una tabla y no un `if`
 *
 * Cada familia nombra y tipa sus cosas distinto, y ninguna avisa cuando se le
 * manda lo que no entiende:
 *
 * - La imagen de referencia es `image_urls` en unas, `image_url` en otras,
 *   `reference_image_urls` o `image_references` en otras.
 * - La duración es **texto** en casi todas y **número** en Seedance y PixVerse.
 * - Y no todas la aceptan libre: Wan solo vende 5, 10 o 15 segundos, y Hailuo
 *   6 o 10. Pedirle siete a Hailuo no da un vídeo de siete.
 * - La resolución tampoco se escribe igual: `720p` en Wan y en Grok, pero
 *   `768P` en Hailuo.
 *
 * Todo esto está sacado de la documentación de cada modelo, no de suponerlo.
 *
 * ## Los precios que faltan
 *
 * Solo van los confirmados. Un precio inventado es peor que ninguno: se decide
 * con él y la factura llega distinta. Los demás salen como «sin confirmar» y el
 * coste real lo reporta el proveedor al terminar.
 */

export type VideoMode = "texto" | "imagen" | "referencias";

export interface VideoGenerator {
  id: string;
  label: string;
  /** El identificador que espera la API. No siempre es el de su documentación. */
  slug: string;
  /** De qué parte: de un texto, de una imagen, o de varias referencias. */
  mode: VideoMode;
  /** Cómo se llama el campo de las imágenes. `null` en los de solo texto. */
  refField: string | null;
  /** Si ese campo es una lista o una sola dirección. */
  refIsArray: boolean;
  /**
   * Las duraciones que vende, cuando solo vende unas cuantas.
   *
   * Vacío significa que acepta cualquiera entre el mínimo y el máximo. Con la
   * lista llena, **cualquier otro valor lo rechaza**: no redondea al más
   * cercano.
   */
  durations: number[];
  minSeconds: number;
  maxSeconds: number;
  /** Si la duración viaja como número. En casi todos va como texto. */
  durationIsNumber: boolean;
  /** Si acepta que se le pida la proporción. */
  hasAspectRatio: boolean;
  /**
   * La resolución que hay que pedirle, **escrita como la escribe él**.
   *
   * `null` cuando no acepta el campo. Varios salen a 480p sin pedirla, que es
   * la mitad que los keyframes y en el montaje se nota el salto.
   */
  resolution: string | null;
  /** Cómo se llama el interruptor de sonido propio. `null` si no sabe generarlo. */
  audioField: string | null;
  /** Dólares por segundo. Cero cuando no está confirmado. */
  usdPerSecond: number;
  note: string;
}

export const VIDEO_GENERATORS: VideoGenerator[] = [
  {
    id: "grok-i2v",
    label: "Grok Imagine · de imagen",
    slug: "grok-imagine/image-to-video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    durations: [],
    minSeconds: 6,
    maxSeconds: 30,
    durationIsNumber: false,
    hasAspectRatio: true,
    resolution: "720p",
    audioField: null,
    usdPerSecond: 0.015,
    note: "El más barato con diferencia y el único que llega a 30 s. Duración libre.",
  },
  {
    id: "grok-t2v",
    label: "Grok Imagine · de texto",
    slug: "grok-imagine/text-to-video",
    mode: "texto",
    refField: null,
    refIsArray: false,
    durations: [],
    minSeconds: 6,
    maxSeconds: 30,
    durationIsNumber: false,
    hasAspectRatio: true,
    resolution: "720p",
    audioField: null,
    usdPerSecond: 0.015,
    note: "Sin imagen de partida: se lo inventa del prompt. Barato para probar ideas.",
  },
  {
    id: "kling3",
    label: "Kling 3.0 · de imagen",
    slug: "kling-3.0/video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    durations: [],
    minSeconds: 3,
    maxSeconds: 15,
    durationIsNumber: false,
    hasAspectRatio: true,
    resolution: null,
    // Kling lo llama así, y en 9:16 el modo estándar ya da 720×1280.
    audioField: "sound",
    usdPerSecond: 0.07,
    note: "La mejor imagen y la más cara. Duración libre de 3 a 15 s.",
  },
  {
    id: "kling26-i2v",
    label: "Kling 2.6 · de imagen",
    slug: "kling-2.6/image-to-video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    durations: [5, 10],
    minSeconds: 5,
    maxSeconds: 10,
    durationIsNumber: false,
    hasAspectRatio: false,
    resolution: null,
    audioField: "sound",
    usdPerSecond: 0,
    note: "Solo 5 o 10 segundos. Puede generar sonido ambiente él mismo.",
  },
  {
    id: "kling26-t2v",
    label: "Kling 2.6 · de texto",
    slug: "kling-2.6/text-to-video",
    mode: "texto",
    refField: null,
    refIsArray: false,
    durations: [5, 10],
    minSeconds: 5,
    maxSeconds: 10,
    durationIsNumber: false,
    hasAspectRatio: true,
    resolution: null,
    audioField: "sound",
    usdPerSecond: 0,
    note: "Solo 5 o 10 segundos, sin imagen de partida y con sonido propio.",
  },
  {
    id: "seedance2",
    label: "Seedance 2 · el completo",
    slug: "bytedance/seedance-2",
    mode: "referencias",
    refField: "reference_image_urls",
    refIsArray: true,
    durations: [],
    minSeconds: 4,
    maxSeconds: 15,
    // Aquí la duración va como **número**, no como texto.
    durationIsNumber: true,
    hasAspectRatio: true,
    resolution: "720p",
    audioField: "generate_audio",
    usdPerSecond: 0,
    note: "El más capaz: hasta 9 referencias, sonido propio, y acepta un guion de 20.000 caracteres. Es el que sirve para un anuncio entero.",
  },
  {
    id: "seedance2-fast",
    label: "Seedance 2 · rápido",
    slug: "bytedance/seedance-2-fast",
    mode: "referencias",
    refField: "reference_image_urls",
    refIsArray: true,
    durations: [],
    minSeconds: 4,
    maxSeconds: 15,
    durationIsNumber: true,
    hasAspectRatio: true,
    resolution: "720p",
    audioField: "generate_audio",
    usdPerSecond: 0,
    note: "Lo mismo, más rápido y más barato. Para probar una idea antes de pagar la buena.",
  },
  {
    id: "wan26-i2v",
    label: "Wan 2.6 · de imagen",
    slug: "wan/2-6-image-to-video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    durations: [5, 10, 15],
    minSeconds: 5,
    maxSeconds: 15,
    durationIsNumber: false,
    hasAspectRatio: false,
    resolution: "720p",
    audioField: null,
    usdPerSecond: 0,
    note: "Solo 5, 10 o 15 segundos. Movimiento suelto y buen detalle.",
  },
  {
    id: "wan26-t2v",
    label: "Wan 2.6 · de texto",
    slug: "wan/2-6-text-to-video",
    mode: "texto",
    refField: null,
    refIsArray: false,
    durations: [5, 10, 15],
    minSeconds: 5,
    maxSeconds: 15,
    durationIsNumber: false,
    hasAspectRatio: false,
    resolution: "720p",
    audioField: null,
    usdPerSecond: 0,
    note: "Solo 5, 10 o 15 segundos, sin imagen de partida.",
  },
  {
    id: "hailuo-i2v",
    label: "Hailuo 02 · de imagen",
    slug: "hailuo/02-image-to-video-standard",
    mode: "imagen",
    // Aquí es **una sola** dirección, no una lista. Mandar la lista se ignora.
    refField: "image_url",
    refIsArray: false,
    durations: [6, 10],
    minSeconds: 6,
    maxSeconds: 10,
    durationIsNumber: false,
    hasAspectRatio: false,
    // Con P mayúscula y 768, no 720: es como lo escribe esta familia y el otro
    // valor lo rechaza.
    resolution: "768P",
    audioField: null,
    usdPerSecond: 0,
    note: "Solo 6 o 10 segundos. Bueno con caras y con movimiento de cámara.",
  },
  {
    id: "pixverse-ref",
    label: "PixVerse v6 · por referencias",
    slug: "pixverse-v6/reference-to-video",
    mode: "referencias",
    refField: "image_references",
    refIsArray: true,
    durations: [],
    minSeconds: 5,
    maxSeconds: 15,
    durationIsNumber: true,
    hasAspectRatio: false,
    resolution: null,
    audioField: "generate_audio_switch",
    usdPerSecond: 0,
    note: "Varias referencias para mantener el mismo personaje. De 5 a 15 s.",
  },
];

export function findGenerator(id: string): VideoGenerator {
  return VIDEO_GENERATORS.find((model) => model.id === id) ?? VIDEO_GENERATORS[0];
}

/** Los que aceptan imágenes: los demás no tienen dónde ponerlas. */
export function acceptsReferences(model: VideoGenerator): boolean {
  return model.refField !== null;
}

/** Si sabe generar sonido él mismo. */
export function hasNativeAudio(model: VideoGenerator): boolean {
  return model.audioField !== null;
}

/**
 * La duración válida más cercana a la que se pide.
 *
 * Con lista cerrada se sube al siguiente que exista en vez de bajar: quien pide
 * siete segundos necesita que quepa lo que va a contar, y un clip corto de más
 * deja la frase a medias. Solo se baja cuando lo pedido pasa del máximo.
 */
export function nearestDuration(model: VideoGenerator, seconds: number): number {
  const wanted = Math.round(seconds);

  if (model.durations.length === 0) {
    return Math.min(model.maxSeconds, Math.max(model.minSeconds, wanted));
  }

  return model.durations.find((option) => option >= wanted) ?? model.durations[model.durations.length - 1];
}

/** Cómo describir las duraciones en la pantalla. */
export function durationLabel(model: VideoGenerator): string {
  if (model.durations.length === 0) return `De ${model.minSeconds} a ${model.maxSeconds} s`;

  return `Solo ${model.durations.slice(0, -1).join(", ")} o ${model.durations[model.durations.length - 1]} s`;
}

/**
 * La entrada que espera ese generador, con sus nombres y sus tipos.
 *
 * Aquí está el valor de la tabla: cada campo se pone como ese modelo lo
 * reconoce, y los que no acepta **no se mandan**. Un campo de más se ignora sin
 * avisar y devuelve un vídeo generado sin la referencia.
 */
export function buildInput(
  model: VideoGenerator,
  options: {
    prompt: string;
    references?: string[];
    seconds?: number;
    aspectRatio?: string;
    /** Solo lo miran los que saben generar sonido. */
    sound?: boolean;
  },
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: options.prompt };

  const references = (options.references ?? []).filter(Boolean);

  if (model.refField && references.length > 0) {
    input[model.refField] = model.refIsArray ? references.slice(0, 7) : references[0];
  }

  if (options.seconds) {
    const seconds = nearestDuration(model, options.seconds);

    // Número o texto según el modelo: el tipo equivocado lo rechaza igual que
    // un valor fuera de lista.
    input.duration = model.durationIsNumber ? seconds : String(seconds);
  }

  if (model.hasAspectRatio && options.aspectRatio) {
    input.aspect_ratio = options.aspectRatio;
  }

  if (model.resolution) input.resolution = model.resolution;

  if (model.slug.startsWith("kling-3.0")) {
    input.mode = "std";
    // Obligatorio en Kling 3.0: si falta, responde 422.
    input.multi_shots = false;
  }

  if (model.slug.startsWith("grok-imagine")) input.mode = "normal";

  /*
   * El sonido propio va apagado salvo que se pida.
   *
   * En el editor de anuncios la locución se pega en el montaje, así que un audio
   * generado encima se solaparía con ella. En el estudio se enciende a mano
   * cuando el plano va suelto.
   */
  if (model.audioField) input[model.audioField] = options.sound === true;

  return input;
}

/** Lo que cuesta, o `null` si no está confirmado. */
export function estimateCost(model: VideoGenerator, seconds: number): number | null {
  if (model.usdPerSecond <= 0) return null;

  return Number((nearestDuration(model, seconds) * model.usdPerSecond).toFixed(2));
}
