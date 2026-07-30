/**
 * De caracteres temporizados a palabras temporizadas.
 *
 * Sin imports, probado en `words.test.ts`.
 *
 * ## Por qué hace falta
 *
 * El generador de voz devuelve la alineación **carácter a carácter**: tres
 * arrays paralelos con cada letra, cuándo empieza y cuándo acaba. Los cortes de
 * las tomas se hacen por palabra, así que hay que agrupar.
 *
 * Parece trivial y tiene dos trampas. La primera: la palabra empieza donde
 * empieza su **primer** carácter y acaba donde acaba el **último**, no donde
 * empieza el siguiente — usar el inicio del espacio siguiente mete el silencio
 * dentro de la palabra y los cortes salen largos.
 *
 * La segunda: los tres arrays pueden venir de distinta longitud si la respuesta
 * llega recortada. Recorrer por el más largo produciría tiempos `undefined` que
 * acaban en `NaN` dentro de la duración de una toma, y un `NaN` se propaga hasta
 * el montaje sin dar ningún error.
 */

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Lo que separa palabras. El salto de línea cuenta: el guion viene en párrafos. */
function isBreak(character: string): boolean {
  return /\s/.test(character);
}

/**
 * Agrupa los caracteres en palabras con sus tiempos.
 *
 * La puntuación se conserva pegada a la palabra —«triste.» sigue siendo una
 * palabra— porque quien compara después ya normaliza. Quitarla aquí obligaría a
 * decidir dos veces qué es puntuación, y las dos decisiones acabarían
 * divergiendo.
 */
export function charactersToWords(alignment: Alignment): TimedWord[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } =
    alignment;

  // Se recorre hasta donde llegan los TRES, no hasta el más largo.
  const length = Math.min(characters.length, starts.length, ends.length);

  const words: TimedWord[] = [];
  let current = "";
  let start = 0;
  let end = 0;

  const flush = () => {
    if (!current) return;
    words.push({ word: current, start, end });
    current = "";
  };

  for (let index = 0; index < length; index += 1) {
    const character = characters[index];

    if (isBreak(character)) {
      flush();
      continue;
    }

    if (!current) start = starts[index];
    current += character;
    end = ends[index];
  }

  flush();

  return words;
}

/**
 * El texto tal y como se pronunció, reconstruido de la alineación.
 *
 * Sirve para comprobar que lo que se mandó es lo que se generó. El generador
 * normaliza el texto por su cuenta —expande números, quita símbolos— y cuando lo
 * hace, los cortes derivados del guion original no encuentran sus palabras. Ver
 * el texto real convierte «no aparecen las tomas 3 y 4» en algo diagnosticable.
 */
export function spokenText(words: TimedWord[]): string {
  return words.map((item) => item.word).join(" ");
}

/**
 * Dónde acaba la voz.
 *
 * Es el final del último carácter, no la duración del archivo: el mp3 suele
 * traer una cola de silencio, y montar contra la duración del archivo dejaría
 * el vídeo colgando unos segundos en negro después de la última palabra.
 */
export function spokenSeconds(words: TimedWord[]): number {
  return words.length === 0 ? 0 : words[words.length - 1].end;
}
