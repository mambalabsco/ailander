/**
 * La biblioteca de música de fondo: qué hay, cómo se filtra y cómo se elige.
 *
 * Sin imports, probado en `music-library.test.ts`.
 *
 * ## Qué es y qué no
 *
 * No es un catálogo de canciones de terceros. No se puede: distribuir obra
 * ajena dentro de la plataforma es publicarla, y para eso hace falta una
 * licencia que no tenemos. Lo que hay es **lo tuyo**: lo que se genera y lo que
 * se suba, etiquetado para poder volver a encontrarlo.
 *
 * Y viene sembrada con `AD_BRIEFS`, un catálogo de encargos escritos —no de
 * audio— para que la biblioteca sirva el primer día, cuando todavía está vacía.
 * Un brief es una descripción lista para mandar a un generador.
 *
 * ## Por qué las etiquetas son cerradas
 *
 * Porque una biblioteca con etiquetas libres deja de poder filtrarse en cuanto
 * pasa de treinta piezas: alguien escribe «epico», otro «épico» y otro
 * «cinematic», y ninguna búsqueda las junta. Con lista cerrada, filtrar por
 * «cinematográfico» encuentra todas — y lo que no encaja en ninguna se queda en
 * el texto libre, que es donde debe estar.
 */

/* -------------------------------- Etiquetas -------------------------------- */

export interface Tag {
  id: string;
  label: string;
  note: string;
}

/** Para qué momento del anuncio sirve. */
export const USES: Tag[] = [
  { id: "gancho", label: "Gancho", note: "Los tres primeros segundos: entra fuerte y para en seco." },
  { id: "problema", label: "Problema", note: "Mientras se cuenta lo que duele. Tensa sin dramatizar." },
  { id: "solucion", label: "Solución", note: "Cuando aparece el producto. Se abre y respira." },
  { id: "prueba", label: "Prueba", note: "Testimonios y datos. No compite con la voz." },
  { id: "cierre", label: "Cierre", note: "La llamada a la acción. Empuja sin atropellar." },
  { id: "completo", label: "Anuncio entero", note: "Una pieza que aguanta de principio a fin." },
];

/** Cómo suena. */
export const MOODS: Tag[] = [
  { id: "cinematografico", label: "Cinematográfico", note: "Cuerdas, percusión grave, aire de tráiler." },
  { id: "inspiracional", label: "Inspiracional", note: "Piano y cuerdas que suben. Lo que se usa en un VSL de salud." },
  { id: "emotivo", label: "Emotivo", note: "Íntimo y lento. Para testimonios." },
  { id: "esperanzador", label: "Esperanzador", note: "Luminoso, mayor, sin drama." },
  { id: "urgencia", label: "Urgencia", note: "Pulso rápido, tensión sostenida. Ofertas y cuentas atrás." },
  { id: "moderno", label: "Moderno", note: "Electrónico, limpio, de marca." },
  { id: "calido", label: "Cálido", note: "Acústico, cercano, casero. UGC." },
  { id: "neutro", label: "Cama neutra", note: "Casi no se nota. Para cuando manda la voz." },
];

/** Cuánta energía tiene. */
export const ENERGIES: Tag[] = [
  { id: "baja", label: "Baja", note: "De fondo. No pide atención." },
  { id: "media", label: "Media", note: "Acompaña y marca el ritmo." },
  { id: "alta", label: "Alta", note: "Manda ella. Para montajes rápidos." },
];

export function findTag(list: Tag[], id: string): Tag | null {
  return list.find((tag) => tag.id === id) ?? null;
}

/* --------------------------- Los encargos sembrados ------------------------ */

export interface Brief {
  id: string;
  label: string;
  mood: string;
  energy: string;
  uses: string[];
  /** El encargo, listo para mandar a un generador. */
  prompt: string;
}

/**
 * Encargos de música de fondo para anuncios.
 *
 * Están escritos como los quiere un generador —instrumentos, tempo, arco,
 * qué **no** hacer— y no como los escribiría una persona. Un «música épica»
 * devuelve algo distinto cada vez; esto no.
 *
 * Todos son instrumentales. Una cama con voz compite con la locución por el
 * mismo sitio del oído, y en un anuncio la locución siempre gana.
 */
export const AD_BRIEFS: Brief[] = [
  {
    id: "vsl-salud",
    label: "VSL de salud",
    mood: "inspiracional",
    energy: "media",
    uses: ["completo", "problema", "solucion"],
    prompt:
      "Instrumental cinematic underscore for a health VSL. Soft piano ostinato, warm sustained strings, subtle low pulse. 80 BPM. Starts intimate, opens gradually from the midpoint, resolves warm. No drums fills, no vocals, no melody that competes with speech.",
  },
  {
    id: "gancho-parada",
    label: "Gancho que para en seco",
    mood: "urgencia",
    energy: "alta",
    uses: ["gancho"],
    prompt:
      "Short instrumental sting for a three-second ad hook. Single low brass hit, riser, abrupt stop into silence. 100 BPM. Tense, unresolved. No vocals, no melody.",
  },
  {
    id: "problema-tension",
    label: "El problema, sin drama",
    mood: "emotivo",
    energy: "baja",
    uses: ["problema"],
    prompt:
      "Instrumental bed for the problem section of an ad. Sparse piano, low cello drone, faint ticking pulse. 70 BPM. Restrained, uneasy, never melodramatic. No drums, no vocals.",
  },
  {
    id: "solucion-apertura",
    label: "La solución que abre",
    mood: "esperanzador",
    energy: "media",
    uses: ["solucion"],
    prompt:
      "Instrumental underscore for the moment a product appears. Major key, strings entering, light bell texture, gentle forward pulse. 90 BPM. Opens and breathes. No vocals, no big percussion.",
  },
  {
    id: "testimonio-calido",
    label: "Testimonio cálido",
    mood: "calido",
    energy: "baja",
    uses: ["prueba", "completo"],
    prompt:
      "Warm acoustic instrumental bed for a customer testimonial. Fingerpicked nylon guitar, soft room tone, light shaker. 75 BPM. Homemade and close. No vocals, no build.",
  },
  {
    id: "cierre-empuje",
    label: "Cierre que empuja",
    mood: "urgencia",
    energy: "alta",
    uses: ["cierre"],
    prompt:
      "Instrumental outro for an ad call to action. Driving low pulse, rising strings, clean stop on the last beat. 110 BPM. Urgent but not frantic. No vocals.",
  },
  {
    id: "cama-neutra",
    label: "Cama que no se nota",
    mood: "neutro",
    energy: "baja",
    uses: ["completo", "prueba"],
    prompt:
      "Neutral instrumental bed under a voiceover. Sustained warm pad, almost no movement, no melodic hook. 70 BPM. Stays the same throughout. No drums, no builds, no vocals.",
  },
  {
    id: "cinematografico-trailer",
    label: "Tráiler cinematográfico",
    mood: "cinematografico",
    energy: "alta",
    uses: ["completo", "gancho"],
    prompt:
      "Cinematic trailer instrumental. Low brass, staccato strings, deep taiko hits, riser into a drop. 90 BPM. Three stages: sparse, building, full. No vocals.",
  },
  {
    id: "moderno-marca",
    label: "Moderno de marca",
    mood: "moderno",
    energy: "media",
    uses: ["completo", "solucion"],
    prompt:
      "Clean modern brand instrumental. Analog synth pulse, muted plucks, tight sub bass, minimal percussion. 100 BPM. Confident and even. No vocals, no drops.",
  },
  {
    id: "esperanza-manana",
    label: "Esperanza de la mañana",
    mood: "esperanzador",
    energy: "media",
    uses: ["completo", "cierre"],
    prompt:
      "Bright uplifting instrumental. Piano arpeggio, warm strings, light claps on the second half. 95 BPM. Major key throughout, gentle lift at the end. No vocals.",
  },
  {
    id: "emotivo-recuerdo",
    label: "Emotivo de recuerdo",
    mood: "emotivo",
    energy: "baja",
    uses: ["problema", "prueba"],
    prompt:
      "Intimate emotional instrumental. Solo piano with felt dampening, distant strings, long reverb tail. 65 BPM. Nostalgic and slow. No percussion, no vocals.",
  },
  {
    id: "urgencia-oferta",
    label: "Urgencia de oferta",
    mood: "urgencia",
    energy: "alta",
    uses: ["cierre", "gancho"],
    prompt:
      "Countdown-style instrumental. Repeating sixteenth-note pulse, rising filter, snare rolls at the end of each phrase. 120 BPM. Relentless. No vocals.",
  },
];

/* ------------------------------- Las licencias ----------------------------- */

export interface License {
  id: string;
  label: string;
  /** Si se puede usar en un anuncio, que es un uso comercial. */
  commercial: boolean;
  /** Si obliga a citar al autor allí donde suene. */
  attribution: boolean;
  note: string;
}

/**
 * Qué se puede usar en un anuncio y qué no.
 *
 * ## Por qué esto es el núcleo y no un detalle
 *
 * Porque «música gratis» y «música que puedes usar en un anuncio» no son lo
 * mismo, y la diferencia no se oye. Buscando «uplifting corporate» en catálogos
 * libres, lo que más sale es **`by-nc-nd`**: NonCommercial prohíbe el uso
 * publicitario y NoDerivatives prohíbe montarla dentro de un vídeo. Suena
 * perfecta, se descarga igual, y es exactamente lo que no se puede poner.
 *
 * Un fallo aquí no se ve al mirar el anuncio: aparece meses después en forma de
 * reclamación. Así que la licencia se comprueba antes de enseñar la pista, no
 * después.
 *
 * `by-sa` queda fuera aunque permita uso comercial: obliga a publicar la obra
 * derivada —el anuncio entero— con la misma licencia.
 */
export const LICENSES: License[] = [
  {
    id: "cc0",
    label: "CC0 · dominio público",
    commercial: true,
    attribution: false,
    note: "Se puede usar en anuncios sin citar a nadie. Es la opción sin letra pequeña.",
  },
  {
    id: "by",
    label: "CC BY · citando al autor",
    commercial: true,
    attribution: true,
    note: "Se puede usar en anuncios, pero hay que citar al autor donde suene. En un anuncio de Meta eso suele ir en el texto.",
  },
];

export function findLicense(id: string): License | null {
  return LICENSES.find((license) => license.id === id.toLowerCase()) ?? null;
}

/**
 * Si esa licencia sirve para un anuncio.
 *
 * Cualquier cosa que no esté en la lista es «no». Es el sentido correcto del
 * fallo: dejar pasar una licencia desconocida por si acaso es lo que acaba en
 * una reclamación, y esconder una que sí valía solo cuesta una pista.
 */
export function usableInAds(license: string): boolean {
  return findLicense(license)?.commercial === true;
}

/* --------------------------------- Las pistas ------------------------------ */

export interface Track {
  id: string;
  name: string;
  url: string;
  seconds: number;
  mood: string;
  energy: string;
  uses: string[];
  /** De dónde salió: generada aquí, subida, o de un catálogo libre. */
  source: "generada" | "subida" | "catalogo";
  /** La licencia, cuando viene de un catálogo. Vacío en las propias. */
  license?: string;
  /** A quién hay que citar, si la licencia lo pide. */
  author?: string;
  /** La página de la pista, para poder comprobar la licencia en su fuente. */
  origin?: string;
  /** El encargo con el que se generó, si se generó. Vale para repetirla. */
  prompt: string;
  notes: string;
}

export interface Filters {
  mood?: string;
  energy?: string;
  use?: string;
  /** Duración mínima: para descartar de un vistazo lo que no cubre el vídeo. */
  minSeconds?: number;
  /** Busca en el nombre, en las notas y en el encargo. */
  text?: string;
}

/** Sin acentos y en minúsculas, para que «épico» encuentre «epico». */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Las pistas que cumplen esos filtros.
 *
 * Un filtro vacío no filtra. Es la diferencia entre «no me importa el ánimo» y
 * «quiero las que no tienen ánimo», y tratarlos igual dejaría la lista vacía en
 * cuanto la pantalla arranca sin nada seleccionado.
 */
export function filterTracks(tracks: Track[], filters: Filters): Track[] {
  const needle = filters.text ? fold(filters.text).trim() : "";

  return tracks.filter((track) => {
    if (filters.mood && track.mood !== filters.mood) return false;
    if (filters.energy && track.energy !== filters.energy) return false;
    if (filters.use && !track.uses.includes(filters.use)) return false;

    /*
     * La duración mínima descarta lo que no cubre el vídeo.
     *
     * Es el filtro que más se va a usar y el que evita el fallo de siempre:
     * elegir una pieza preciosa de treinta segundos para un anuncio de noventa.
     */
    if (filters.minSeconds && track.seconds > 0 && track.seconds < filters.minSeconds) {
      return false;
    }

    if (needle) {
      const haystack = fold(`${track.name} ${track.notes} ${track.prompt}`);
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/**
 * Cómo se cuenta una pista en una línea, para que un modelo pueda elegir.
 *
 * Va con el identificador delante porque lo que se le pide de vuelta es el
 * identificador: describir la pista elegida con palabras obligaría a
 * emparejarla después por nombre, y dos pistas se pueden llamar igual.
 */
export function describeTrack(track: Track): string {
  const mood = findTag(MOODS, track.mood)?.label ?? track.mood;
  const energy = findTag(ENERGIES, track.energy)?.label ?? track.energy;
  const uses = track.uses
    .map((use) => findTag(USES, use)?.label ?? use)
    .filter(Boolean)
    .join(", ");

  return [
    `[${track.id}] ${track.name}`,
    `${Math.round(track.seconds)} s`,
    `ánimo: ${mood}`,
    `energía: ${energy}`,
    uses ? `sirve para: ${uses}` : "",
    track.notes ? `notas: ${track.notes}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El encargo con el que se le pide a un modelo que elija.
 *
 * ## Por qué se le dan las pistas y no se le deja buscar
 *
 * Porque tiene que elegir **entre lo que hay**. Un modelo al que se le pregunta
 * «qué música va bien para esto» contesta con una descripción preciosa de una
 * pista que no existe en la biblioteca, y entonces hay que buscarla a mano — que
 * es exactamente el trabajo que se quería quitar.
 *
 * ## Y por qué se le pide el motivo
 *
 * Porque una elección sin motivo no se puede discutir. Con el motivo delante se
 * ve si entendió el criterio o si se quedó con la primera que encajaba de
 * nombre, y eso decide si fiarse o mirar la siguiente.
 */
export function buildPickPrompt(options: {
  criteria: string;
  tracks: Track[];
  seconds?: number;
}): string {
  const duration =
    options.seconds && options.seconds > 0
      ? `El vídeo dura unos ${Math.round(options.seconds)} segundos, así que descarta las más cortas salvo que el resto encaje mucho mejor y lo digas.`
      : "";

  return [
    "Elige la música de fondo para un anuncio, entre las que hay en la biblioteca.",
    "",
    "Criterios de quien lo pide, literales:",
    options.criteria.trim(),
    "",
    duration,
    "",
    "La biblioteca:",
    options.tracks.map(describeTrack).join("\n"),
    "",
    "Devuelve la que mejor cumpla, con su identificador exacto entre corchetes tal y como aparece, y en dos frases por qué esa y no las otras dos que más se le acercaban.",
    "Si ninguna cumple de verdad, dilo y explica qué falta en la biblioteca en vez de elegir la menos mala.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * El identificador que eligió el modelo.
 *
 * Se busca entre corchetes y **se comprueba contra la lista**. Un modelo puede
 * devolver un identificador que se ha inventado o el de una pista que ya se
 * borró, y usarlo sin comprobar pondría en el anuncio una música que no existe
 * — o ninguna, en silencio.
 */
export function readPick(answer: string, tracks: Track[]): Track | null {
  const ids = new Set(tracks.map((track) => track.id));

  for (const match of answer.matchAll(/\[([^\]]+)\]/g)) {
    const id = match[1].trim();
    if (ids.has(id)) return tracks.find((track) => track.id === id) ?? null;
  }

  return null;
}

/* ----------------------------- Catálogos libres ---------------------------- */

/**
 * La dirección de búsqueda en Openverse.
 *
 * Openverse busca a la vez en Freesound, Jamendo y Wikimedia, y **filtra por
 * licencia en el servidor**, que es lo que hace falta: pedirlo todo y filtrar
 * aquí traería noventa resultados inservibles por cada uno bueno.
 *
 * Se piden solo las licencias que valen para un anuncio. No es una preferencia:
 * `by-nc-nd` es lo que más abunda buscando música de fondo, y es exactamente lo
 * que no se puede usar.
 */
export function openverseQuery(options: {
  text: string;
  /** Cuánto tiene que durar, para no traer efectos de dos segundos. */
  minSeconds?: number;
  /** Si se aceptan las que obligan a citar al autor. */
  allowAttribution?: boolean;
  page?: number;
}): string {
  const licenses = LICENSES.filter(
    (license) => options.allowAttribution || !license.attribution,
  ).map((license) => license.id);

  const params = new URLSearchParams({
    q: options.text.trim() || "instrumental background",
    license: licenses.join(","),
    page_size: "40",
    page: String(Math.max(1, Math.round(options.page ?? 1))),
  });

  /*
   * `length` es grueso —corto, medio, largo— pero se manda igual: recorta en el
   * servidor la mayor parte de los efectos de sonido, que es lo que llena los
   * resultados cuando se busca música en un catálogo que también tiene efectos.
   * La duración exacta se comprueba después, con el número que viene en cada
   * resultado.
   */
  if (options.minSeconds && options.minSeconds > 120) params.set("length", "long");
  else if (options.minSeconds && options.minSeconds > 30) params.set("length", "medium");

  return `https://api.openverse.org/v1/audio/?${params.toString()}`;
}

/**
 * Una pista del catálogo, o `null` si no sirve.
 *
 * ## Los dos motivos por los que se descarta
 *
 * **La licencia.** Se vuelve a comprobar aquí aunque ya se haya pedido filtrada:
 * el filtro del servidor es de ellos y puede cambiar, y lo que está en juego es
 * publicar un anuncio con música que no se puede usar.
 *
 * **La duración.** Viene en **milisegundos**, y ese es el fallo que este mapeo
 * existe para evitar: un `duration: 9369` leído como segundos convierte un
 * golpe de percusión de nueve segundos en una pieza de dos horas y media, que
 * pasaría cualquier filtro de «que cubra el vídeo».
 */
export function readCatalogTrack(raw: unknown, minSeconds = 0): Track | null {
  if (typeof raw !== "object" || raw === null) return null;

  const item = raw as {
    id?: unknown;
    title?: unknown;
    url?: unknown;
    duration?: unknown;
    license?: unknown;
    creator?: unknown;
    foreign_landing_url?: unknown;
    provider?: unknown;
    tags?: unknown;
  };

  const id = typeof item.id === "string" ? item.id : "";
  const url = typeof item.url === "string" ? item.url : "";
  const license = typeof item.license === "string" ? item.license.toLowerCase() : "";

  if (!id || !url) return null;
  if (!usableInAds(license)) return null;

  const seconds = Math.round(Number(item.duration ?? 0) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (minSeconds > 0 && seconds < minSeconds) return null;

  const tags = Array.isArray(item.tags)
    ? item.tags
        .map((tag) => (typeof tag === "object" && tag !== null ? (tag as { name?: unknown }).name : tag))
        .filter((name): name is string => typeof name === "string")
    : [];

  return {
    id,
    name: typeof item.title === "string" && item.title ? item.title : "Sin título",
    url,
    seconds,
    // El ánimo y la energía se deducen de las etiquetas del catálogo, que son
    // libres: lo que no se reconoce se queda sin clasificar en vez de inventarse.
    mood: moodFromTags(tags),
    energy: energyFromTags(tags),
    uses: [],
    source: "catalogo",
    license,
    author: typeof item.creator === "string" ? item.creator : "",
    origin: typeof item.foreign_landing_url === "string" ? item.foreign_landing_url : "",
    prompt: "",
    notes: tags.slice(0, 8).join(", "),
  };
}

/** Palabras del catálogo que apuntan a cada ánimo nuestro. */
const MOOD_HINTS: Record<string, string[]> = {
  cinematografico: ["cinematic", "trailer", "epic", "orchestral", "film"],
  inspiracional: ["inspiring", "uplifting", "motivational", "hopeful"],
  emotivo: ["emotional", "sad", "melancholy", "piano", "intimate"],
  esperanzador: ["happy", "bright", "positive", "sunny"],
  urgencia: ["tension", "suspense", "driving", "urgent", "action"],
  moderno: ["electronic", "synth", "techno", "modern", "corporate"],
  calido: ["acoustic", "guitar", "folk", "warm"],
  neutro: ["ambient", "drone", "background", "loop", "pad"],
};

function moodFromTags(tags: string[]): string {
  const words = tags.map((tag) => tag.toLowerCase());

  for (const [mood, hints] of Object.entries(MOOD_HINTS)) {
    if (hints.some((hint) => words.some((word) => word.includes(hint)))) return mood;
  }

  return "";
}

function energyFromTags(tags: string[]): string {
  const words = tags.map((tag) => tag.toLowerCase()).join(" ");

  if (/(fast|energetic|action|driving|intense|aggressive)/.test(words)) return "alta";
  if (/(slow|calm|ambient|soft|gentle|quiet)/.test(words)) return "baja";

  return "";
}

/** Cómo hay que acreditar esa pista, si hay que acreditarla. */
export function attributionFor(track: Track): string {
  if (track.source !== "catalogo") return "";

  const license = findLicense(track.license ?? "");
  if (!license?.attribution) return "";

  return `«${track.name}» de ${track.author || "autor desconocido"}, licencia ${license.label}. ${track.origin}`.trim();
}
