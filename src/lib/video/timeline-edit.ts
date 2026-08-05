import type { Track } from "./timeline.ts";

/**
 * La línea de tiempo que se puede tocar a mano.
 *
 * Probado en `timeline-edit.test.ts`.
 *
 * ## En qué se diferencia de `timeline.ts`
 *
 * Aquel **construye** una línea de tiempo a partir de los cortes de la voz: es
 * automático y no se discute. Este es lo que pasa después, cuando se mira el
 * resultado y hay que mover un corte medio segundo, quitar el trozo del medio de
 * una toma o alargar el último plano. Los dos acaban en el mismo formato.
 *
 * Están separados porque tienen dueños distintos: el primero lo decide el guion
 * y el segundo lo decide una persona mirando el vídeo.
 *
 * ## Por qué el modelo va aparte del editor
 *
 * Porque lo que rompe un montaje no es el dibujo. Es un recorte que se pasa del
 * final del archivo, dos planos pisándose en la misma pista, o un hueco de medio
 * segundo entre dos cortes. **Ninguno de los tres da error**: el primero
 * devuelve negro, el segundo enseña uno de los dos sin decir cuál, y el tercero
 * mete un parpadeo. Se ven al mirar el vídeo terminado, después de haberlo
 * montado y pagado.
 *
 * Aquí se comprueban sin arrancar un navegador.
 *
 * ## Todo en segundos, redondeado a la milésima
 *
 * El montador trabaja en milisegundos enteros. Guardar segundos con decimales
 * infinitos hace que dos cortes que deberían coincidir salgan a un milisegundo
 * de distancia —`0.1 + 0.2` no da `0.3`— y ese milisegundo es un fotograma negro
 * entre dos planos.
 */

/** Las tres pistas de un montaje: una imagen, una voz, una música. */
export type TrackKind = "video" | "voz" | "musica";

export interface Clip {
  id: string;
  url: string;
  kind: TrackKind;
  /** Cuánto dura el archivo entero. Cero es «no se sabe». */
  sourceSeconds: number;
  /** Desde qué punto del archivo se empieza a usar. */
  inPoint: number;
  /** Cuánto se usa. */
  duration: number;
  /** En qué segundo de la línea de tiempo entra. */
  start: number;
}

export interface Timeline {
  clips: Clip[];
}

/** Lo más corto que puede durar un clip: un fotograma a 25 por segundo. */
export const MIN_SECONDS = 0.04;

/** Al milisegundo, que es la unidad del montador. */
export function round(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(seconds * 1000) / 1000;
}

const endOf = (clip: Clip): number => round(clip.start + clip.duration);

/** Los de una pista, en el orden en que suenan. */
export function trackOf(timeline: Timeline, kind: TrackKind): Clip[] {
  return timeline.clips.filter((clip) => clip.kind === kind).sort((a, b) => a.start - b.start);
}

/**
 * Cuánto dura el montaje.
 *
 * Lo marca **la imagen**, no la pista más larga. Es la misma regla que ya usa el
 * montaje del flujo y por el mismo motivo: estirar el vídeo hasta donde llega la
 * voz no repite el último fotograma, pone negro.
 */
export function totalSeconds(timeline: Timeline): number {
  const picture = trackOf(timeline, "video");
  if (picture.length === 0) return 0;

  return round(Math.max(...picture.map(endOf)));
}

/* --------------------------------- Editar ---------------------------------- */

/**
 * Mueve un clip a otro segundo.
 *
 * No se deja empezar antes de cero: el montador recorta lo que quede en
 * negativo, así que el vídeo saldría empezando por la mitad de ese plano sin que
 * nada lo dijera.
 */
export function moveClip(timeline: Timeline, id: string, start: number): Timeline {
  return {
    clips: timeline.clips.map((clip) =>
      clip.id === id ? { ...clip, start: round(Math.max(0, start)) } : clip,
    ),
  };
}

/**
 * Cambia qué trozo del archivo se usa.
 *
 * Tres topes, y cada uno tapa un fallo que no se ve:
 *
 * - **Nunca menos de un fotograma.** Un clip de duración cero está en la lista,
 *   no se ve, y no hay forma de agarrarlo para borrarlo.
 * - **Nunca antes del principio del archivo.**
 * - **Nunca más allá del final**, cuando se sabe cuánto dura. Pedir más de lo
 *   que hay no da error: el montador rellena con negro y con silencio.
 *
 * Con `sourceSeconds` a cero se deja pasar lo que se pida. Es la única salida
 * honesta: inventar un tope recortaría un plano que sí existía.
 */
export function trimClip(
  timeline: Timeline,
  id: string,
  next: { inPoint?: number; duration?: number },
): Timeline {
  return {
    clips: timeline.clips.map((clip) => {
      if (clip.id !== id) return clip;

      const known = clip.sourceSeconds > 0;

      const inPoint = known
        ? Math.min(Math.max(0, round(next.inPoint ?? clip.inPoint)), round(clip.sourceSeconds - MIN_SECONDS))
        : Math.max(0, round(next.inPoint ?? clip.inPoint));

      const wanted = Math.max(MIN_SECONDS, round(next.duration ?? clip.duration));
      const room = known ? round(clip.sourceSeconds - inPoint) : wanted;

      return { ...clip, inPoint, duration: Math.max(MIN_SECONDS, Math.min(wanted, room)) };
    }),
  };
}

/**
 * Parte un clip en dos por un punto de la línea de tiempo.
 *
 * Es la operación con la que se quita el medio de una toma sin volver a
 * generarla. El segundo trozo **arranca el archivo donde lo dejó el primero**:
 * si empezara de cero, la segunda mitad repetiría el principio y quedaría un
 * salto que parece un fallo del modelo.
 *
 * Un corte que cae fuera del clip no hace nada. Partir por un punto donde ese
 * plano no está no significa nada, y devolver un trozo vacío sí rompe.
 */
export function splitAt(timeline: Timeline, id: string, at: number): Timeline {
  const clip = timeline.clips.find((item) => item.id === id);
  if (!clip) return timeline;

  const cut = round(at);
  const left = round(cut - clip.start);
  const right = round(endOf(clip) - cut);

  if (left < MIN_SECONDS || right < MIN_SECONDS) return timeline;

  return {
    clips: [
      ...timeline.clips.filter((item) => item.id !== id),
      { ...clip, duration: left },
      {
        ...clip,
        id: `${clip.id}-b`,
        start: cut,
        inPoint: round(clip.inPoint + left),
        duration: right,
      },
    ],
  };
}

export function removeClip(timeline: Timeline, id: string): Timeline {
  return { clips: timeline.clips.filter((clip) => clip.id !== id) };
}

/**
 * Pega los clips de una pista uno detrás de otro, sin huecos.
 *
 * Es lo que se quiere casi siempre después de borrar algo del medio: lo de
 * detrás sube. Se conserva el orden en el que estaban en el tiempo, no el de la
 * lista — la lista puede venir en cualquier orden y reordenar el montaje por eso
 * sería cambiar el anuncio sin que nadie lo pidiera.
 */
export function closeGaps(timeline: Timeline, kind: TrackKind): Timeline {
  const ordered = trackOf(timeline, kind);
  const moved = new Map<string, number>();

  let at = 0;

  for (const clip of ordered) {
    moved.set(clip.id, at);
    at = round(at + clip.duration);
  }

  return {
    clips: timeline.clips.map((clip) =>
      moved.has(clip.id) ? { ...clip, start: moved.get(clip.id) ?? clip.start } : clip,
    ),
  };
}

/* -------------------------------- Los avisos ------------------------------- */

export interface Problem {
  clipId: string;
  problem: string;
}

/**
 * Lo que va a salir mal, antes de montar.
 *
 * Ninguno de estos da error al montar: todos devuelven un vídeo con la duración
 * correcta. Por eso se comprueban aquí, donde todavía se arreglan sin pagar la
 * vuelta.
 */
export function problemsOf(timeline: Timeline): Problem[] {
  const problems: Problem[] = [];

  for (const clip of timeline.clips) {
    /*
     * Pedir más de lo que dura el archivo.
     *
     * El montador no avisa: rellena con negro si es imagen y con silencio si es
     * audio. Un plano que se queda tres segundos en negro parece un fallo del
     * generador, y lo que hay es un recorte mal puesto.
     */
    if (clip.sourceSeconds > 0 && round(clip.inPoint + clip.duration) > clip.sourceSeconds + 0.05) {
      const over = round(clip.inPoint + clip.duration - clip.sourceSeconds);

      problems.push({
        clipId: clip.id,
        problem: `Se piden ${over.toFixed(2)} s más de los que tiene el archivo: esa parte saldrá en negro o en silencio.`,
      });
    }
  }

  /*
   * Dos clips a la vez en la misma pista.
   *
   * El montador enseña uno de los dos y no dice cuál. Al mirar el vídeo se ve
   * que falta una toma, y en la línea de tiempo están las dos.
   */
  for (const kind of ["video", "voz", "musica"] as TrackKind[]) {
    const ordered = trackOf(timeline, kind);

    for (let at = 1; at < ordered.length; at += 1) {
      const before = ordered[at - 1];
      const now = ordered[at];

      if (now.start + 0.001 < endOf(before)) {
        problems.push({
          clipId: now.id,
          problem: `Se pisa con «${before.id}» durante ${round(endOf(before) - now.start).toFixed(2)} s.`,
        });
      }
    }
  }

  /*
   * Huecos en la imagen.
   *
   * Un hueco es negro. Medio segundo de negro en mitad de un anuncio se lee
   * como un fallo de reproducción, y quien lo ve se va.
   */
  const picture = trackOf(timeline, "video");

  if (picture.length > 0 && picture[0].start > 0.05) {
    problems.push({
      clipId: picture[0].id,
      problem: `El anuncio empieza con ${picture[0].start.toFixed(2)} s de negro.`,
    });
  }

  for (let at = 1; at < picture.length; at += 1) {
    const gap = round(picture[at].start - endOf(picture[at - 1]));

    if (gap > 0.05) {
      problems.push({
        clipId: picture[at].id,
        problem: `Hay ${gap.toFixed(2)} s de negro antes de este plano.`,
      });
    }
  }

  return problems;
}

/* ------------------------- Lo que espera el montador ----------------------- */

/**
 * Las pistas en el formato del montador, en milisegundos.
 *
 * ## El clip recortado por el principio
 *
 * `timestamp` dice dónde entra en el montaje y `duration` cuánto ocupa, pero
 * **no hay dónde decir por qué punto del archivo empieza**. Un clip con
 * `inPoint` mandado tal cual sonaría desde su principio, descuadrado justo por
 * lo que se había recortado.
 *
 * Así que esos se devuelven aparte, en `needsTrim`, para que quien llame los
 * recorte antes de montar. Mandarlos y confiar sería el fallo silencioso de
 * siempre: el vídeo sale, dura lo que tiene que durar, y va desincronizado.
 *
 * Cada clip va en **su propia pista**, no varios en una: con varios en la misma
 * pista el montador se quedaba con el último y lo repetía hasta el final del
 * audio. Está documentado en `timeline.ts` y costó varias vueltas descubrirlo.
 */
export function toComposeTracks(timeline: Timeline): {
  tracks: Track[];
  needsTrim: Clip[];
} {
  const needsTrim = timeline.clips.filter((clip) => clip.inPoint > 0.001);

  const tracks: Track[] = [];

  for (const kind of ["video", "voz", "musica"] as TrackKind[]) {
    for (const [index, clip] of trackOf(timeline, kind).entries()) {
      tracks.push({
        id: `${kind}-${String(index + 1).padStart(2, "0")}`,
        type: kind === "video" ? "video" : "audio",
        keyframes: [
          {
            timestamp: Math.round(clip.start * 1000),
            duration: Math.round(clip.duration * 1000),
            url: clip.url,
          },
        ],
      });
    }
  }

  return { tracks, needsTrim };
}
