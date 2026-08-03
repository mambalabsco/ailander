/**
 * El catálogo de generadores de vídeo, con los campos que espera cada uno.
 *
 * Sin imports, probado en `catalog.test.ts`.
 *
 * ## Por qué esto es una tabla y no un `if`
 *
 * Cada familia nombra sus cosas distinto. La imagen de referencia es
 * `image_urls` en unos, `image_url` en otros y `reference_image_urls` en otros;
 * el identificador del modelo no coincide con la dirección de su documentación
 * —`pixverse/reference-to-video` se pide como `pixverse-v6/reference-to-video`—
 * y hay quien acepta duración y quien no.
 *
 * Y equivocarse **no da error**: el campo que no reconoce se ignora y devuelve
 * un vídeo bonito generado sin la referencia. Es el peor tipo de fallo, porque
 * parece que funcionó.
 *
 * Por eso cada entrada dice literalmente cómo se llama cada campo, y todo está
 * sacado de la documentación de la API, no de suponerlo.
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
  /** Si acepta que se le pida la duración. */
  hasDuration: boolean;
  /** Si acepta que se le pida la proporción. */
  hasAspectRatio: boolean;
  /** Si acepta que se le pida la resolución. Varios salen a 480p sin pedirla. */
  hasResolution: boolean;
  minSeconds: number;
  maxSeconds: number;
  /** Dólares por segundo. Cero cuando no está confirmado. */
  usdPerSecond: number;
  /** Si puede generar sonido él mismo. */
  nativeAudio: boolean;
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
    hasAspectRatio: true,
    hasResolution: true,
    hasDuration: true,
    minSeconds: 6,
    maxSeconds: 30,
    usdPerSecond: 0.015,
    nativeAudio: false,
    note: "El más barato con diferencia y cobra por segundo. Hasta siete referencias.",
  },
  {
    id: "grok-t2v",
    label: "Grok Imagine · de texto",
    slug: "grok-imagine/text-to-video",
    mode: "texto",
    refField: null,
    refIsArray: false,
    hasAspectRatio: true,
    hasResolution: true,
    hasDuration: true,
    minSeconds: 6,
    maxSeconds: 30,
    usdPerSecond: 0.015,
    nativeAudio: false,
    note: "Sin imagen de partida: se lo inventa del prompt. Barato para probar ideas.",
  },
  {
    id: "kling3",
    label: "Kling 3.0 · de imagen",
    slug: "kling-3.0/video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    hasAspectRatio: true,
    hasResolution: false,
    hasDuration: true,
    minSeconds: 5,
    maxSeconds: 10,
    usdPerSecond: 0.07,
    nativeAudio: false,
    note: "La mejor imagen. Solo vende clips de cinco o de diez, así que 5,6 s pagan diez.",
  },
  {
    id: "kling26-i2v",
    label: "Kling 2.6 · de imagen, con sonido",
    slug: "kling-2.6/image-to-video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    hasAspectRatio: false,
    hasResolution: false,
    hasDuration: true,
    minSeconds: 5,
    maxSeconds: 10,
    usdPerSecond: 0,
    nativeAudio: true,
    note: "Puede generar sonido ambiente él mismo. Útil para planos sin locución encima.",
  },
  {
    id: "kling26-t2v",
    label: "Kling 2.6 · de texto, con sonido",
    slug: "kling-2.6/text-to-video",
    mode: "texto",
    refField: null,
    refIsArray: false,
    hasAspectRatio: true,
    hasResolution: false,
    hasDuration: true,
    minSeconds: 5,
    maxSeconds: 10,
    usdPerSecond: 0,
    nativeAudio: true,
    note: "Sin imagen de partida y con sonido propio.",
  },
  {
    id: "seedance2",
    label: "Seedance 2 · por referencias",
    slug: "bytedance/seedance-2",
    mode: "referencias",
    refField: "reference_image_urls",
    refIsArray: true,
    hasAspectRatio: false,
    hasResolution: false,
    hasDuration: false,
    minSeconds: 0,
    maxSeconds: 0,
    usdPerSecond: 0,
    nativeAudio: false,
    note: "Mantiene un personaje o un producto entre planos con varias referencias.",
  },
  {
    id: "wan26-i2v",
    label: "Wan 2.6 · de imagen",
    slug: "wan/2-6-image-to-video",
    mode: "imagen",
    refField: "image_urls",
    refIsArray: true,
    hasAspectRatio: false,
    hasResolution: true,
    hasDuration: true,
    minSeconds: 5,
    maxSeconds: 10,
    usdPerSecond: 0,
    nativeAudio: false,
    note: "Movimiento suelto y buen detalle. Alternativa a Kling.",
  },
  {
    id: "wan26-t2v",
    label: "Wan 2.6 · de texto",
    slug: "wan/2-6-text-to-video",
    mode: "texto",
    refField: null,
    refIsArray: false,
    hasAspectRatio: false,
    hasResolution: true,
    hasDuration: true,
    minSeconds: 5,
    maxSeconds: 10,
    usdPerSecond: 0,
    nativeAudio: false,
    note: "Sin imagen de partida.",
  },
  {
    id: "hailuo-i2v",
    label: "Hailuo 02 · de imagen",
    slug: "hailuo/02-image-to-video-standard",
    mode: "imagen",
    // Aquí es **una sola** dirección, no una lista. Mandar la lista se ignora.
    refField: "image_url",
    refIsArray: false,
    hasAspectRatio: false,
    hasResolution: true,
    hasDuration: true,
    minSeconds: 6,
    maxSeconds: 10,
    usdPerSecond: 0,
    nativeAudio: false,
    note: "Bueno con caras y con movimiento de cámara. Una sola imagen de partida.",
  },
  {
    id: "pixverse-ref",
    label: "PixVerse v6 · por referencias",
    slug: "pixverse-v6/reference-to-video",
    mode: "referencias",
    refField: "image_references",
    refIsArray: true,
    hasAspectRatio: false,
    hasResolution: false,
    hasDuration: false,
    minSeconds: 0,
    maxSeconds: 0,
    usdPerSecond: 0,
    nativeAudio: false,
    note: "Varias referencias a la vez para mantener el mismo personaje.",
  },
];

export function findGenerator(id: string): VideoGenerator {
  return VIDEO_GENERATORS.find((model) => model.id === id) ?? VIDEO_GENERATORS[0];
}

/** Los que aceptan imágenes: los demás no tienen dónde ponerlas. */
export function acceptsReferences(model: VideoGenerator): boolean {
  return model.refField !== null;
}

/**
 * La entrada que espera ese generador, con sus nombres.
 *
 * Aquí está el valor de la tabla: cada campo se pone con el nombre que ese
 * modelo reconoce, y los que no acepta **no se mandan**. Un campo de más se
 * ignora sin avisar y devuelve un vídeo generado sin la referencia.
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

  if (model.hasDuration && options.seconds) {
    const seconds = Math.min(
      model.maxSeconds,
      Math.max(model.minSeconds, Math.round(options.seconds)),
    );

    // Como cadena: es lo que piden todas las familias comprobadas.
    input.duration = String(seconds);
  }

  if (model.hasAspectRatio && options.aspectRatio) {
    input.aspect_ratio = options.aspectRatio;
  }

  // 720p no es el valor por defecto en varios: sin pedirlo sale a 480p, la mitad
  // que los keyframes, y en el montaje se nota el salto de nitidez.
  if (model.hasResolution) input.resolution = "720p";

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
  if (model.nativeAudio) input.sound = options.sound === true;

  return input;
}

/** Lo que cuesta, o `null` si no está confirmado. */
export function estimateCost(model: VideoGenerator, seconds: number): number | null {
  if (model.usdPerSecond <= 0) return null;

  const billed = model.hasDuration
    ? Math.min(model.maxSeconds, Math.max(model.minSeconds, Math.round(seconds)))
    : seconds;

  return Number((billed * model.usdPerSecond).toFixed(2));
}
