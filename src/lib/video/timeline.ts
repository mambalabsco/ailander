/**
 * El montaje, como línea de tiempo.
 *
 * Sin imports, probado en `timeline.test.ts`.
 *
 * ## Por qué el montaje no se hace en el servidor
 *
 * El pipeline original monta con ffmpeg local y mide el quemado final en unos
 * cincuenta segundos por cada minuto de vídeo **en una máquina de dieciséis
 * núcleos**. El servidor de esta plataforma tiene dos, y es el mismo proceso que
 * sirve las páginas: cada montaje dejaría la aplicación arrastrándose varios
 * minutos. Y codifica dos veces —normalizar cada clip y quemar el final—, así
 * que no es un problema que se arregle ajustando un preset.
 *
 * Se manda a un servicio de composición que devuelve el mp4 ya montado. La
 * plataforma solo espera, que es lo que ya hace bien con el resto de
 * generaciones.
 *
 * ## Lo que hace este archivo
 *
 * Convierte los cortes —que salieron de la voz real— en la línea de tiempo que
 * espera el servicio: una pista de vídeo con cada clip colocado en su
 * milisegundo, y una pista de audio con la voz entera encima.
 *
 * **El recorte de cada toma sale de su corte, no del clip.** El generador
 * devuelve clips de cinco o diez segundos enteros; lo que dura la toma en el
 * montaje es lo que dura su frase narrada. Colocar el clip completo
 * descuadraría todo lo que viene detrás.
 */

/* ------------------------------- La salida -------------------------------- */

export interface Keyframe {
  /** Milisegundos desde el principio del vídeo. */
  timestamp: number;
  /** Milisegundos que ocupa. */
  duration: number;
  url: string;
}

export interface Track {
  id: string;
  type: "video" | "audio" | "image";
  keyframes: Keyframe[];
}

/* ------------------------------- La entrada ------------------------------- */

export interface TimelineCut {
  n: string;
  start: number;
  end: number;
}

export interface TimelineInput {
  cuts: TimelineCut[];
  /**
   * Toma → clip que va en ella.
   *
   * Se prefiere el de lipsync cuando existe; quien llama ya lo resolvió. Aquí
   * llega un solo enlace por toma.
   */
  clips: Record<string, string>;
  /** La voz completa, la misma que dio los cortes. */
  voiceUrl: string;
  /**
   * Lo que dura la voz de verdad.
   *
   * Es lo que impide que el vídeo acabe en negro. La imagen se acaba cuando
   * acaba el último corte, pero la voz sigue sonando hasta el final del audio:
   * todo ese rato quedaba a oscuras. Y si a la mayoría de las tomas les faltaban
   * los tiempos, «ese rato» era casi el vídeo entero.
   */
  voiceSeconds?: number;
  /** Los subtítulos ya dibujados, con su tiempo. */
  captions?: { url: string; start: number; end: number }[];
  /**
   * La música de fondo, si la hay.
   *
   * El montaje no tiene control de volumen, así que el archivo tiene que venir
   * ya bajo. Una pista a volumen normal tapa la voz y el anuncio no se entiende
   * — y eso no se arregla desde aquí.
   */
  musicUrl?: string;
}

export interface TimelineResult {
  tracks: Track[];
  /** Tomas sin clip, que dejarían un hueco negro. */
  missing: string[];
  /** Duración total en segundos. */
  seconds: number;
}

const toMs = (seconds: number) => Math.round(seconds * 1000);

/**
 * Arma la línea de tiempo.
 *
 * ## Cada toma va en su segundo real, no pegada a la anterior
 *
 * Antes se colocaban una detrás de otra empezando en cero, con la duración de
 * su corte. Suena razonable y **descuadra el vídeo entero**: la voz suena
 * seguida desde el segundo cero, pero los cortes no se tocan entre sí —hay
 * silencio entre frases, y la primera casi nunca empieza en el cero exacto—.
 * Cada hueco que se ignoraba adelantaba la imagen un poco más, así que el
 * desajuste **crecía según avanzaba el vídeo**: al principio se nota poco y al
 * final la escena va por delante de lo que se oye.
 *
 * Ahora cada toma se coloca en el instante en que empieza su frase dentro del
 * audio, que es la única forma de que imagen y voz coincidan.
 *
 * ## Y se estira hasta que empieza la siguiente
 *
 * Si cada toma durase solo lo que dura su frase, los silencios entre frases
 * quedarían en negro. Estirando cada plano hasta el arranque del siguiente no
 * hay huecos y el corte cae justo cuando empieza a hablarse de lo otro, que es
 * donde tiene que caer.
 *
 * La primera empieza en cero aunque su frase empiece más tarde: ese medio
 * segundo de arranque tiene que verse.
 */
export function buildTimeline(input: TimelineInput): TimelineResult {
  const video: Keyframe[] = [];
  const missing: string[] = [];

  const usable = input.cuts
    .filter((cut) => {
      const ok = Boolean(input.clips[cut.n]) && cut.end > cut.start;
      if (!ok) missing.push(cut.n);
      return ok;
    })
    /*
     * Ordenados por su instante, pase lo que pase antes.
     *
     * El orden llega bien hoy, pero de él depende todo lo de abajo: un corte
     * fuera de sitio hace que el siguiente empiece antes que el anterior, la
     * duración salga negativa y esa toma se caiga — y una toma que se cae no se
     * ve, solo se nota porque la de al lado dura de más.
     */
    .slice()
    .sort((a, b) => a.start - b.start);

  let cursor = 0;

  let previousEnd = 0;

  for (const [index, cut] of usable.entries()) {
    /*
     * La primera arranca en cero; las demás, donde empieza su frase — pero nunca
     * antes de que acabe la anterior.
     *
     * Dos cortes que se pisan dejarían dos clips solapados en la misma pista, y
     * ahí solo se ve uno: el vídeo se queda con una escena colgada mientras la
     * voz habla de otra cosa.
     */
    const start = index === 0 ? 0 : Math.max(cut.start, previousEnd);

    /*
     * Hasta el arranque de la siguiente, o hasta el final de la suya.
     *
     * Una toma que se cayó no deja hueco: la anterior se estira por encima,
     * porque el siguiente corte se calcula contra la siguiente **que sí está**.
     */
    /*
     * Hasta el arranque de la siguiente; la última, hasta que se calla la voz.
     *
     * Estirar la última es lo que quita el negro del final. Una imagen sostenida
     * de más se lee como un plano largo, que es una decisión de montaje normal;
     * el negro se lee como que el vídeo se rompió.
     */
    const end =
      index + 1 < usable.length
        ? usable[index + 1].start
        : Math.max(cut.end, input.voiceSeconds ?? 0);

    const duration = Math.max(0, end - start);

    if (duration <= 0) continue;

    video.push({ timestamp: toMs(start), duration: toMs(duration), url: input.clips[cut.n] });

    previousEnd = start + duration;
    cursor = Math.max(cursor, previousEnd);
  }

  const captions: Keyframe[] = (input.captions ?? [])
    .filter((caption) => caption.end > caption.start)
    .map((caption) => ({
      timestamp: toMs(caption.start),
      duration: toMs(caption.end - caption.start),
      url: caption.url,
    }));

  // La voz manda sobre la duración total: si sigue sonando, el vídeo sigue.
  const total = Math.max(cursor, input.voiceSeconds ?? 0);

  return {
    tracks: [
      { id: "broll", type: "video", keyframes: video },
      /*
       * La voz entera en un solo trozo, desde cero.
       *
       * Cortarla por tomas y volver a pegarla introduciría un salto en cada
       * unión —los cortes caen entre palabras, pero el silencio de una
       * respiración no es idéntico al de la siguiente— y se oiría.
       */
      {
        id: "voz",
        type: "audio",
        keyframes: [{ timestamp: 0, duration: toMs(total), url: input.voiceUrl }],
      },

      /*
       * La música va **antes** que los subtítulos y después de la voz.
       *
       * El orden de las pistas es el orden en que se apilan: los subtítulos
       * tienen que quedar los últimos o el vídeo los taparía.
       */
      ...(input.musicUrl
        ? [
            {
              id: "musica",
              type: "audio" as const,
              keyframes: [{ timestamp: 0, duration: toMs(total), url: input.musicUrl }],
            },
          ]
        : []),

      ...(captions.length > 0
        ? [{ id: "subtitulos", type: "image" as const, keyframes: captions }]
        : []),
    ],
    missing,
    seconds: Number(total.toFixed(2)),
  };
}
