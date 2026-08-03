/**
 * Los generadores de música, con los campos que espera cada uno.
 *
 * Sin imports, probado en `music.test.ts`.
 *
 * ## Por qué hay varios y no uno
 *
 * El que había —Cassette— es baratísimo y a veces no da el pego. Para una cama
 * de fondo que no compite con la locución suele bastar, pero cuando no basta no
 * hay nada que hacer: no es un problema de prompt, es el modelo. Así que hay
 * varios y se elige, con el precio delante para poder decidir.
 *
 * ## Y por qué esto vuelve a ser una tabla
 *
 * Los mismos tropiezos de siempre, y ninguno da error:
 *
 * - La duración se llama `duration` en uno, `music_length_ms` en otro y
 *   `seconds_total` en otro. Y hay uno que no la acepta.
 * - El resultado viene en `audio_file` en Cassette y en `audio` en el resto.
 *   Buscar el campo que no es devuelve vacío, no un fallo.
 * - El interruptor de «sin voces» es `force_instrumental` o `is_instrumental`
 *   según el modelo.
 *
 * ## Los precios
 *
 * Los que publica fal, tal cual, en dólares por minuto de salida. Los que no
 * publica salen como «sin confirmar», no con un número puesto a ojo.
 */

export interface MusicGenerator {
  id: string;
  label: string;
  /** El identificador que espera fal. */
  slug: string;
  /** Cómo se llama la duración. `null` si no se puede pedir. */
  durationField: string | null;
  /** Si esa duración va en milisegundos. */
  durationInMs: boolean;
  minSeconds: number;
  maxSeconds: number;
  /** Cómo se llama el interruptor de «sin voces». */
  instrumentalField: string | null;
  /** En qué campo de la respuesta viene el audio. */
  outputField: string;
  /** Dólares por minuto de salida. Cero cuando fal no lo publica. */
  usdPerMinute: number;
  /** Si se cobra el minuto entero aunque salgan treinta segundos. */
  billsWholeMinutes: boolean;
  note: string;
}

export const MUSIC_GENERATORS: MusicGenerator[] = [
  {
    id: "cassette",
    label: "Cassette",
    slug: "cassetteai/music-generator",
    durationField: "duration",
    durationInMs: false,
    minSeconds: 10,
    maxSeconds: 180,
    instrumentalField: null,
    // El único que no lo llama `audio`.
    outputField: "audio_file",
    usdPerMinute: 0.02,
    billsWholeMinutes: false,
    note: "Regalado y suficiente para una cama de fondo. Es el que fallaba cuando el anuncio pedía algo con más carácter.",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs Music",
    slug: "fal-ai/elevenlabs/music",
    durationField: "music_length_ms",
    // Aquí en milisegundos: mandarle segundos da tres segundos de música.
    durationInMs: true,
    minSeconds: 3,
    maxSeconds: 600,
    instrumentalField: "force_instrumental",
    outputField: "audio",
    usdPerMinute: 0.8,
    // Redondea hacia arriba: treinta segundos pagan un minuto.
    billsWholeMinutes: true,
    note: "El mejor de largo, y cuarenta veces más caro. Cobra por minuto empezado, así que conviene pedir el largo justo.",
  },
  {
    id: "minimax",
    label: "Minimax Music 2.6",
    slug: "fal-ai/minimax-music/v2.6",
    durationField: null,
    durationInMs: false,
    minSeconds: 0,
    maxSeconds: 0,
    instrumentalField: "is_instrumental",
    outputField: "audio",
    usdPerMinute: 0,
    billsWholeMinutes: false,
    note: "Suena a canción de verdad. No deja pedir duración: da lo que da y el montaje lo recorta.",
  },
  {
    id: "stable-audio",
    label: "Stable Audio 2.5",
    slug: "fal-ai/stable-audio-25/text-to-audio",
    durationField: "seconds_total",
    durationInMs: false,
    minSeconds: 1,
    maxSeconds: 190,
    instrumentalField: null,
    outputField: "audio",
    usdPerMinute: 0,
    billsWholeMinutes: false,
    note: "Bueno con texturas y ambientes; menos con melodías. Acepta duración al segundo.",
  },
  {
    id: "lyria",
    label: "Lyria 3",
    slug: "fal-ai/lyria3",
    durationField: null,
    durationInMs: false,
    minSeconds: 0,
    maxSeconds: 0,
    instrumentalField: null,
    outputField: "audio",
    usdPerMinute: 0,
    billsWholeMinutes: false,
    note: "El de Google. Muy musical, pero tampoco deja pedir duración.",
  },
];

export function findMusicGenerator(id: string): MusicGenerator {
  return MUSIC_GENERATORS.find((model) => model.id === id) ?? MUSIC_GENERATORS[0];
}

/**
 * La entrada que espera ese generador.
 *
 * Lo instrumental se pide **por el campo** cuando existe, además de decirlo en
 * el prompt. El prompt es una sugerencia y el campo es una garantía: una cama
 * con voz compite con la locución por el mismo sitio del oído.
 */
export function buildMusicInput(
  model: MusicGenerator,
  options: { prompt: string; seconds: number },
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: options.prompt };

  if (model.durationField) {
    const seconds = Math.min(model.maxSeconds, Math.max(model.minSeconds, Math.round(options.seconds)));

    input[model.durationField] = model.durationInMs ? Math.round(seconds * 1000) : seconds;
  }

  if (model.instrumentalField) input[model.instrumentalField] = true;

  return input;
}

/**
 * Saca la dirección del audio de la respuesta.
 *
 * El campo cambia según el modelo y dentro puede venir como texto o como objeto
 * con `url`. Se aceptan las dos: fal usa las dos formas según el endpoint, y
 * equivocarse aquí devuelve vacío en vez de un error que se pueda leer.
 */
export function readMusicUrl(model: MusicGenerator, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const value = (payload as Record<string, unknown>)[model.outputField];

  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string") return url;
  }

  return "";
}

/** Lo que cuesta esa música, o `null` si el precio no está confirmado. */
export function musicCost(model: MusicGenerator, seconds: number): number | null {
  if (model.usdPerMinute <= 0) return null;

  const minutes = model.billsWholeMinutes
    ? Math.max(1, Math.ceil(seconds / 60))
    : Math.max(0, seconds) / 60;

  return Number((minutes * model.usdPerMinute).toFixed(3));
}

/** Cómo contarlo en la pantalla antes de gastar. */
export function musicCostLabel(model: MusicGenerator, seconds: number): string {
  const cost = musicCost(model, seconds);

  if (cost === null) return "Precio sin confirmar: fal no lo publica y lo verás en tu factura.";

  const rounded = model.billsWholeMinutes ? " (cobra el minuto empezado)" : "";

  return `Unos ${cost.toFixed(2)} USD por ${Math.round(seconds)} s${rounded}.`;
}

/* ----------------------- Qué música pedirle al modelo ---------------------- */

/**
 * El encargo de la música, a partir de lo que vende el anuncio.
 *
 * Se pide **instrumental y sin protagonismo** siempre. Una cama con voz compite
 * con la locución por el mismo sitio del oído, y una melodía con gancho se lleva
 * la atención justo cuando se está contando el mecanismo.
 */
export function buildMusicPrompt(options: {
  productName: string;
  audience: string;
  mood?: string;
}): string {
  const mood = options.mood?.trim() || "cálido y esperanzador, con un pulso constante que avanza";

  return [
    `Instrumental background bed for a direct-response supplement ad about ${options.productName}, aimed at ${options.audience}.`,
    `Mood: ${mood}.`,
    // Sin voces ni instrumento solista: la locución va encima.
    "No vocals, no singing, no spoken word, no prominent lead melody.",
    "Soft sustained pads, gentle low percussion, subtle warm bass.",
    "Even dynamics, no sudden hits, no drops, nothing that pulls attention from a voice-over.",
    "Loopable, consistent from start to end.",
  ].join(" ");
}
