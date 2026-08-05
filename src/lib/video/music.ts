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
  /**
   * Si acepta semilla, y con qué nombre.
   *
   * Es lo único que garantiza que dos generaciones seguidas no salgan iguales.
   * Solo lo tiene uno de los cinco.
   */
  seedField: string | null;
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
    seedField: null,
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
    seedField: null,
    usdPerMinute: 0.8,
    // Redondea hacia arriba: treinta segundos pagan un minuto.
    billsWholeMinutes: true,
    note: "El mejor de largo, y cuarenta veces más caro. Cobra por minuto empezado, así que conviene pedir el largo justo. Es el único que entrega MP3: los demás dan WAV y una pista larga puede pasarse del tope al guardarla.",
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
    seedField: null,
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
    seedField: "seed",
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
    seedField: null,
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
  options: {
    prompt: string;
    seconds: number;
    /**
     * Qué número de intento es, empezando en uno.
     *
     * Es lo que evita que dos generaciones seguidas salgan idénticas. Ver
     * `variationHint` para por qué hace falta.
     */
    take?: number;
  },
): Record<string, unknown> {
  const take = Math.max(1, Math.round(options.take ?? 1));

  const input: Record<string, unknown> = {
    prompt: take > 1 ? `${options.prompt} ${variationHint(take)}` : options.prompt,
  };

  if (model.durationField) {
    const seconds = Math.min(model.maxSeconds, Math.max(model.minSeconds, Math.round(options.seconds)));

    input[model.durationField] = model.durationInMs ? Math.round(seconds * 1000) : seconds;
  }

  if (model.instrumentalField) input[model.instrumentalField] = true;

  // Donde hay semilla es lo que manda: garantiza una pieza distinta.
  if (model.seedField) input[model.seedField] = take * 7919;

  return input;
}

/**
 * Lo que se le añade al encargo para que la segunda vez suene distinta.
 *
 * ## Por qué hace falta
 *
 * Generar dos veces con el mismo encargo devolvía **exactamente la misma
 * pieza**. Solo uno de los cinco generadores acepta semilla, así que en los
 * otros cuatro no hay ninguna forma de pedir «lo mismo pero otra vez»: con la
 * entrada idéntica, la respuesta es idéntica —sea porque el modelo es
 * determinista o porque el proveedor reutiliza la respuesta anterior—.
 *
 * Lo único que queda es que el encargo no sea idéntico. Y en vez de meter un
 * número al azar, que ensucia el prompt sin decir nada, se le pide lo que le
 * pedirías a un músico: otra toma. Es una instrucción que el modelo entiende y
 * que no cambia el encargo, solo la interpretación.
 *
 * ## Por qué no vale pedir «otra toma»
 *
 * Eso fue lo primero que se probó, y no funciona. «Otra toma, misma idea» es lo
 * que le pedirías a un músico; a un modelo sin semilla el encargo le sigue
 * describiendo la misma pieza y devuelve la misma pieza. Lyria 3 la repitió tres
 * veces seguidas.
 *
 * Lo que sí funciona es cambiar algo que está **en la partitura**: el tono, quién
 * lleva la melodía, el compás, por dónde empieza el arreglo. Eso obliga a
 * componer otra cosa en vez de interpretar lo mismo.
 *
 * ## Lo que sigue sin estar garantizado
 *
 * Que sea muy distinta. Con semilla —Stable Audio— sí lo está, y por eso ahí se
 * usa la semilla y esto es solo un añadido.
 */
export function variationHint(take: number): string {
  /*
   * Cambios **musicales**, no fórmulas de cortesía.
   *
   * «Otra toma, misma idea» es lo que le pedirías a un músico, y con un músico
   * funciona. A un modelo sin semilla no: el encargo sigue describiendo la misma
   * pieza y devuelve la misma pieza. Lyria 3 lo hacía tres veces seguidas.
   *
   * Lo que sí cambia el resultado es cambiar algo que **está en la partitura**:
   * el tono, el instrumento que lleva la melodía, el compás, por dónde empieza.
   * Cada una de estas obliga a componer otra cosa, no a interpretar lo mismo.
   */
  const takes = [
    "Different take: transpose to a different key and let a different instrument carry the melody.",
    "Different take: change the chord progression and start on the subdominant instead of the tonic.",
    "Different take: shift the tempo by about ten BPM and swap the percussion for a different pulse.",
    "Different take: reverse the arrangement order — start with the fullest section and strip it back.",
    "Different take: change the time feel to a triplet swing and use a different lead instrument.",
    "Different take: move to the relative minor and thin the arrangement to two instruments.",
  ];

  return takes[(Math.max(2, take) - 2) % takes.length];
}

/** Si ese generador puede garantizar que la siguiente salga distinta. */
export function guaranteesVariation(model: MusicGenerator): boolean {
  return model.seedField !== null;
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

/* ------------------------------- Los estilos -------------------------------- */

export interface MusicStyle {
  id: string;
  label: string;
  note: string;
  /** Con qué se toca. Es lo que más cambia el resultado. */
  instruments: string;
  /** A qué velocidad, en pulsaciones por minuto. */
  tempo: string;
  /**
   * Cómo evoluciona.
   *
   * Vacío en la cama neutra: es la única que **no** debe evolucionar.
   */
  arc: string;
}

/**
 * Los estilos que se pueden pedir.
 *
 * ## Por qué hacía falta esto
 *
 * El encargo era uno solo y estaba escrito para una cama de fondo bajo una
 * locución densa: «sin melodía principal, dinámica plana, sin subidas, nada que
 * distraiga de una voz». Para eso está bien, y para un anuncio tipo película es
 * exactamente la receta de una pista sosa — le estaba **prohibiendo** al modelo
 * todo lo que hace que una música de VSL funcione.
 *
 * Ahora la cama neutra es una opción más, no la única.
 *
 * ## Y por qué cada estilo dice instrumentos, tempo y arco
 *
 * Porque «inspiracional» no le dice nada a un generador: es una palabra que cada
 * modelo interpreta como quiere. «Piano y cuerdas, 90 pulsaciones, entra solo el
 * piano y a la mitad entran las cuerdas» sí, y sale parecido dos veces seguidas.
 */
export const MUSIC_STYLES: MusicStyle[] = [
  {
    id: "cinematografico",
    label: "Cinematográfico",
    note: "De tráiler: tensión que crece y golpe en el momento del producto.",
    instruments:
      "deep sub bass, low brass swells, tense sustained strings, muffled taiko-style drums, occasional rising riser, sparse metallic hits",
    tempo: "90 BPM, half-time feel",
    arc: "starts sparse and tense, tension builds through the middle, one clear release near the end that opens into wide sustained brass and strings",
  },
  {
    id: "inspiracional",
    label: "Inspiracional",
    note: "Piano y cuerdas que suben. El de los anuncios que emocionan.",
    instruments:
      "solo piano, warm string section, soft mallet percussion, light choir pad in the last third",
    tempo: "88 BPM",
    arc: "starts with piano alone, strings enter around a third of the way in, builds steadily, resolves warm and major at the end",
  },
  {
    id: "emotivo",
    label: "Emotivo",
    note: "Piano y chelo, íntimo. Para testimonios y para el problema.",
    instruments: "intimate felt piano, solo cello, faint room tone, no drums",
    tempo: "70 BPM",
    arc: "stays intimate throughout, one small swell in the middle, ends unresolved and quiet",
  },
  {
    id: "esperanzador",
    label: "Esperanzador",
    note: "Guitarra acústica y luz de mañana. Menos épico, más cercano.",
    instruments:
      "fingerpicked acoustic guitar, soft piano, light shaker and claps, warm upright bass",
    tempo: "100 BPM",
    arc: "gentle start, percussion enters early, stays bright and steady, small lift at the end",
  },
  {
    id: "urgencia",
    label: "Urgencia",
    note: "Pulso que no para. Para la parte del problema y para la oferta.",
    instruments:
      "driving muted pulse, ticking percussion, low staccato strings, tight kick, rising synth line",
    tempo: "120 BPM",
    arc: "constant forward pressure, tightens progressively, cuts to near silence for one beat before the end",
  },
  {
    id: "moderno",
    label: "Moderno",
    note: "Electrónico limpio, tipo anuncio de tecnología.",
    instruments: "clean synth plucks, soft analog pad, tight electronic kick, subtle vinyl texture",
    tempo: "110 BPM",
    arc: "steady groove from the start, filter opens gradually, bright and even by the end",
  },
  {
    id: "cama",
    label: "Cama neutra",
    note: "Plana a propósito: para cuando la locución no deja hueco.",
    instruments: "soft sustained pads, gentle low percussion, subtle warm bass",
    tempo: "80 BPM",
    arc: "",
  },
];

export function findMusicStyle(id: string): MusicStyle {
  return MUSIC_STYLES.find((style) => style.id === id) ?? MUSIC_STYLES[0];
}

/**
 * El encargo de la música.
 *
 * ## Lo que se pide siempre
 *
 * **Instrumental.** Una cama con voz compite con la locución por el mismo sitio
 * del oído: no es cuestión de volumen, es que no caben dos voces.
 *
 * ## Y lo que ya no se prohíbe
 *
 * Antes se pedía además dinámica plana, sin subidas y sin melodía principal. Para
 * una cama bajo una locución densa está bien; para un anuncio tipo película es la
 * receta de una pista sosa. Ahora eso solo lo pide el estilo «cama neutra», que
 * es el único al que le corresponde.
 */
export function buildMusicPrompt(options: {
  productName: string;
  audience: string;
  /** El estilo elegido. Sin él, el cinematográfico. */
  styleId?: string;
  /** Un matiz escrito a mano, que se añade al estilo en vez de sustituirlo. */
  mood?: string;
  seconds?: number;
}): string {
  const style = findMusicStyle(options.styleId ?? "");
  const seconds = options.seconds && options.seconds > 0 ? Math.round(options.seconds) : 0;

  const lines = [
    `Instrumental score for a direct-response video ad about ${options.productName}, aimed at ${options.audience}.`,
    `Style: ${style.label.toLowerCase()}. ${style.note}`,
    `Instruments: ${style.instruments}.`,
    `Tempo: ${style.tempo}.`,
  ];

  if (style.arc) {
    lines.push(`Arrangement: ${style.arc}.`);
  } else {
    /*
     * La cama neutra es la única que pide quedarse quieta, y lo pide explícito:
     * un modelo al que no le dices nada del arreglo te mete una subida igual.
     */
    lines.push(
      "Arrangement: even from start to end, no build, no drop, nothing that pulls attention from a voice-over.",
    );
  }

  if (seconds > 0) lines.push(`Length: about ${seconds} seconds.`);

  if (options.mood?.trim()) lines.push(`Also: ${options.mood.trim()}.`);

  // Siempre, y al final para que sea lo último que lee.
  lines.push(
    "No vocals, no singing, no spoken word, no lyrics: a voice-over goes on top.",
    "Leave the midrange around 1-4 kHz uncrowded so speech stays clear.",
  );

  return lines.join(" ");
}

/**
 * Qué va a durar de verdad la pieza que pidas.
 *
 * ## Por qué esto existe
 *
 * Porque el campo de segundos se deja rellenar siempre, y hay generadores que
 * no lo miran: Lyria y Minimax devuelven lo que ellos deciden —unos treinta
 * segundos— pidas lo que pidas. El campo aceptaba un 90, no daba error, y la
 * música salía de 30. El fallo se descubría al ver el anuncio con dos tercios
 * en silencio.
 *
 * Devuelve `null` cuando el generador no publica su duración: es «no se sabe»,
 * que no es lo mismo que treinta y hay que enseñarlo distinto.
 */
export function realSeconds(model: MusicGenerator, asked: number): number | null {
  if (!model.durationField) return null;

  return Math.min(model.maxSeconds, Math.max(model.minSeconds, Math.round(asked)));
}

/**
 * Qué avisar antes de generar, si es que hay algo que avisar.
 *
 * Vacío cuando la pieza va a cubrir el vídeo. Se escribe aquí y no en la
 * pantalla para que digan lo mismo el estudio y el flujo: dos redacciones del
 * mismo aviso acaban siendo dos criterios distintos.
 */
export function durationWarning(model: MusicGenerator, asked: number): string {
  const real = realSeconds(model, asked);
  const wanted = Math.round(asked);

  if (real === null) {
    return `${model.label} no acepta duración: da la pieza que él decide, en torno a 30 s. Si el vídeo dura más, se repetirá en bucle con un salto audible en cada vuelta. Para una pieza continua elige uno que acepte duración.`;
  }

  if (real < wanted) {
    return `${model.label} llega a ${model.maxSeconds} s, así que de los ${wanted} pedidos saldrán ${real}. El resto se cubre repitiendo.`;
  }

  return "";
}

/** Los que sí dejan pedir cuánto tiene que durar. */
export function takesDuration(model: MusicGenerator): boolean {
  return model.durationField !== null;
}

/**
 * Lo que da ese generador como mucho, en segundos.
 *
 * Los que no aceptan duración devuelven una pieza suya de en torno a treinta
 * segundos. No está publicado al segundo, así que se usa treinta como lo que se
 * puede contar con ello: pasarse aquí haría creer que cubre un vídeo que no
 * cubre, y quedarse corto solo hace que la lista sea algo más estricta.
 */
export const FIXED_SECONDS = 30;

export function reach(model: MusicGenerator): number {
  return takesDuration(model) ? model.maxSeconds : FIXED_SECONDS;
}

/**
 * Los generadores que pueden cubrir un vídeo de esa duración de una pieza.
 *
 * ## Por qué filtrar y no solo avisar
 *
 * Porque avisar deja la decisión donde no toca. Con la lista entera delante,
 * elegir Lyria para un anuncio de noventa segundos es un clic normal, y el
 * resultado —treinta segundos de música y sesenta de bucle o de silencio— no se
 * ve hasta tener el vídeo montado. Quitando de la lista lo que no llega, ese
 * clic deja de existir.
 *
 * Nunca devuelve vacío: si ninguno llega, se devuelven todos y quien llama lo
 * dice. Una lista vacía es una pantalla rota, y el problema no es que no haya
 * generadores, es que ninguno da tanto.
 */
export function generatorsFor(seconds: number): MusicGenerator[] {
  const wanted = Math.round(seconds);
  if (!Number.isFinite(wanted) || wanted <= 0) return MUSIC_GENERATORS;

  const enough = MUSIC_GENERATORS.filter((model) => reach(model) >= wanted);

  return enough.length > 0 ? enough : MUSIC_GENERATORS;
}

/** Si para esa duración no hay ninguno que llegue, qué decir. */
export function outOfReachNote(seconds: number): string {
  const wanted = Math.round(seconds);
  const best = MUSIC_GENERATORS.reduce((top, model) =>
    reach(model) > reach(top) ? model : top,
  );

  if (reach(best) >= wanted) return "";

  return `Ninguno llega a ${wanted} s. El que más da es ${best.label}, con ${reach(best)} s: el resto se cubriría repitiendo.`;
}
