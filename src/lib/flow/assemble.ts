/**
 * Qué montar y cuánto dura cada cosa.
 *
 * Sin imports, probado en `assemble.test.ts`.
 *
 * ## Por qué esto es un módulo aparte
 *
 * Porque el montaje es donde se han roto todas las veces, y siempre en
 * silencio. La lista de lo que salió mal en este proyecto es larga y ninguna dio
 * un error:
 *
 * - **El vídeo repetía el último plano en bucle.** Se le pasaban los seis
 *   planos al montador esperando que los pusiera en fila, y no hace eso: hay
 *   que recortar cada uno por separado y encadenarlos antes.
 * - **Cola negra al final.** La pista de vídeo acababa donde el último corte y
 *   la voz seguía sonando sobre negro.
 * - **La música tapaba la voz**, porque el montador mezcla sin control de
 *   volumen.
 * - **Los subtítulos iban descuadrados**, por calcular tiempos sobre el archivo
 *   de voz suelto en vez de sobre el vídeo terminado.
 *
 * Todo eso son decisiones de duración y de orden, o sea aritmética. Aquí se
 * puede probar sin gastar un céntimo, que es lo contrario de lo que costó
 * descubrirlas.
 */

export interface Track {
  /** De qué nodo salió, para poder decir cuál falla. */
  id: string;
  url: string;
  /** Lo que dura de verdad. Cero significa **no se sabe**, no cero. */
  seconds: number;
}

export interface Plan {
  /** Los planos a recortar y encadenar, en orden. */
  clips: { id: string; url: string; seconds: number }[];
  voice: Track | null;
  music: Track | null;
  /** Cuánto dura el montaje. */
  seconds: number;
  /** Lo que hay que contar antes de montar. */
  warnings: string[];
  /** Lo que impide montar. Con algo aquí, no se monta. */
  blockers: string[];
}

/**
 * Prepara el montaje y dice qué va a salir mal antes de que salga.
 *
 * Devuelve avisos y bloqueos por separado a propósito: un aviso es algo que se
 * puede aceptar —la música se queda corta y el final va sin ella— y un bloqueo
 * es algo que produciría un vídeo que nadie quiere.
 */
export function planAssembly(input: {
  clips: Track[];
  voice?: Track | null;
  music?: Track | null;
}): Plan {
  const warnings: string[] = [];
  const blockers: string[] = [];

  const clips = input.clips.filter((clip) => clip.url);

  if (clips.length === 0) {
    blockers.push("No hay ningún plano que montar.");
  }

  /*
   * Varios planos que son el mismo archivo.
   *
   * Es el síntoma exacto del fallo que costó varias vueltas: el vídeo salía
   * repitiendo un plano de principio a fin y desde fuera parecía un montaje
   * roto. Montarlo otra vez daría lo mismo, así que se dice aquí.
   */
  const distinct = new Set(clips.map((clip) => clip.url)).size;

  if (clips.length > 1 && distinct === 1) {
    blockers.push(
      `Los ${clips.length} planos son el mismo archivo: el vídeo saldría repitiéndolo. Revisa que cada nodo de clip haya producido el suyo.`,
    );
  } else if (clips.length > 2 && distinct < clips.length) {
    warnings.push(`${clips.length - distinct} plano(s) están repetidos.`);
  }

  /*
   * Un plano cuya duración no se conoce se monta entero.
   *
   * Cero no es cero segundos: es «no se sabe». Tratarlo como duración daría un
   * plano de duración nula, o sea un plano que desaparece.
   */
  const unknown = clips.filter((clip) => clip.seconds <= 0);
  if (unknown.length > 0) {
    warnings.push(
      `De ${unknown.length} plano(s) no se sabe la duración: entran enteros y el total es aproximado.`,
    );
  }

  const picture = clips.reduce((sum, clip) => sum + Math.max(0, clip.seconds), 0);

  const voice = input.voice?.url ? input.voice : null;
  const music = input.music?.url ? input.music : null;

  /*
   * La duración manda la **imagen**, no la voz.
   *
   * Estirar la pista hasta la voz es lo que dejaba cola negra: el montador no
   * repite el último fotograma, pone negro. Así que el vídeo dura lo que dura la
   * imagen y, si la voz es más larga, se dice cuánto sobra en vez de entregar
   * un final a oscuras.
   */
  const seconds = picture > 0 ? picture : (voice?.seconds ?? 0);

  if (voice && voice.seconds > 0 && picture > 0) {
    const over = voice.seconds - picture;

    if (over > 0.5) {
      warnings.push(
        `La voz dura ${voice.seconds.toFixed(1)} s y los planos suman ${picture.toFixed(1)} s: se cortarán ${over.toFixed(1)} s de voz. Añade otro plano si quieres que entre entera.`,
      );
    } else if (over < -1.5) {
      warnings.push(
        `Los planos duran ${(-over).toFixed(1)} s más que la voz: el final va sin locución.`,
      );
    }
  }

  if (music && music.seconds > 0 && music.seconds + 0.5 < seconds) {
    warnings.push(
      `La música dura ${music.seconds.toFixed(1)} s y el vídeo ${seconds.toFixed(1)} s: el final queda sin música.`,
    );
  }

  if (seconds <= 0) {
    blockers.push("No se pudo saber cuánto dura nada de lo que hay que montar.");
  }

  return {
    clips: clips.map((clip) => ({ id: clip.id, url: clip.url, seconds: clip.seconds })),
    voice,
    music,
    seconds: Number(seconds.toFixed(2)),
    warnings,
    blockers,
  };
}

/**
 * Las pistas que espera el montador, ya con sus tiempos.
 *
 * **Un solo fotograma de vídeo**, con los planos ya encadenados. Es el arreglo
 * del fallo que costó varias vueltas: pasarle los planos sueltos para que los
 * colocara devolvía el último repetido de principio a fin.
 */
export function composeTracks(plan: Plan, pictureUrl: string) {
  const ms = Math.round(plan.seconds * 1000);

  const tracks: {
    id: string;
    type: "video" | "audio";
    keyframes: { timestamp: number; duration: number; url: string }[];
  }[] = [{ id: "video", type: "video", keyframes: [{ timestamp: 0, duration: ms, url: pictureUrl }] }];

  if (plan.voice) {
    tracks.push({
      id: "voz",
      type: "audio",
      keyframes: [{ timestamp: 0, duration: ms, url: plan.voice.url }],
    });
  }

  if (plan.music) {
    tracks.push({
      id: "musica",
      type: "audio",
      keyframes: [{ timestamp: 0, duration: ms, url: plan.music.url }],
    });
  }

  return tracks;
}
