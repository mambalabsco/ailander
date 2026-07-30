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
 * Las tomas se colocan **pegadas, en el orden de los cortes**, no en el instante
 * en que empieza su frase dentro del audio original. Parece lo mismo y no lo es:
 * si una toma se cae, colocar por el tiempo original dejaría un hueco negro en
 * medio, mientras que pegándolas el vídeo se acorta y sigue viéndose. La voz
 * queda desplazada en ese caso, y por eso las que faltan se devuelven aparte
 * para poder avisar antes de montar.
 */
export function buildTimeline(input: TimelineInput): TimelineResult {
  const video: Keyframe[] = [];
  const missing: string[] = [];

  let cursor = 0;

  for (const cut of input.cuts) {
    const url = input.clips[cut.n];
    const duration = Math.max(0, cut.end - cut.start);

    if (!url || duration <= 0) {
      missing.push(cut.n);
      continue;
    }

    video.push({ timestamp: toMs(cursor), duration: toMs(duration), url });
    cursor += duration;
  }

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
        keyframes: [{ timestamp: 0, duration: toMs(cursor), url: input.voiceUrl }],
      },
    ],
    missing,
    seconds: Number(cursor.toFixed(2)),
  };
}
