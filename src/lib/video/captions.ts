/**
 * Los subtítulos quemados en el vídeo.
 *
 * Sin imports, probado en `captions.test.ts`. El dibujado va aparte, en
 * `caption-image.ts`, porque necesita el rasterizador y eso no se puede probar
 * sin él.
 *
 * ## Por qué no se transcribe el audio
 *
 * Hay servicios que ponen subtítulos solos escuchando el vídeo, y aquí serían un
 * error. El guion se escribe **fonético** para que la voz lo pronuncie bien:
 * «eme ce te» en vez de «MCT», «treinta y cuatro mil novecientos noventa» en vez
 * de «$34.990». Un servicio que escuche eso escribirá lo que oye, y el subtítulo
 * saldrá «eme ce te» — que es exactamente el fallo que más delata un vídeo
 * generado, y para el que ya existe el campo `sub`.
 *
 * Como los tiempos por palabra ya los tenemos, no hace falta escuchar nada: se
 * escribe el texto correcto en el segundo correcto.
 *
 * ## Se parte por trozos cortos
 *
 * Una frase entera en pantalla se lee de un vistazo y deja de acompañar a la
 * voz. Dos o tres palabras cada vez van al ritmo de lo que se oye, que es lo que
 * hace que se sigan sin esfuerzo.
 */

/**
 * Palabras por trozo.
 *
 * Tres, no cuatro. El subtítulo de vídeo vertical que funciona va **grande y
 * corto**: dos o tres palabras enormes que cambian al ritmo de la voz. Con
 * cuatro ya hay que encogerlo para que quepa, y encogerlo es lo que lo convierte
 * en un subtítulo de película que nadie mira.
 */
export const WORDS_PER_LINE = 3;

export interface CaptionPiece {
  text: string;
  start: number;
  end: number;
}

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Los trozos de subtítulo de una toma, con sus tiempos.
 *
 * El texto que se escribe es el de `sub` cuando existe, y el hablado si no. Los
 * tiempos salen de las palabras del audio, así que **el número de palabras
 * escritas no tiene por qué coincidir con el de las habladas**: «MCT» es una
 * palabra escrita y tres habladas. Por eso los tiempos se reparten
 * proporcionalmente sobre el tramo entero de la toma en vez de emparejarse una a
 * una — emparejar habría descuadrado justo las tomas que llevan `sub`, que son
 * las que lo necesitan.
 */
export function captionPieces(options: {
  written: string;
  start: number;
  end: number;
  perLine?: number;
}): CaptionPiece[] {
  const words = options.written.trim().split(/\s+/).filter(Boolean);
  const span = options.end - options.start;

  if (words.length === 0 || span <= 0) return [];

  const perLine = Math.max(1, options.perLine ?? WORDS_PER_LINE);

  /*
   * El reparto va por lo larga que es cada palabra, no a partes iguales.
   *
   * «De» y «convertirla» no se tardan lo mismo en decir. A partes iguales el
   * subtítulo se adelanta en los trozos con palabras largas y se atrasa en los
   * de palabras cortas, y eso se lee como que va desincronizado aunque el tramo
   * entero encaje.
   *
   * Se cuenta una letra de más por palabra: la pausa entre palabras existe.
   */
  const weights = words.map((word) => word.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const pieces: CaptionPiece[] = [];
  let elapsed = 0;

  for (let index = 0; index < words.length; index += perLine) {
    const chunk = words.slice(index, index + perLine);
    const chunkWeight = weights.slice(index, index + perLine).reduce((sum, w) => sum + w, 0);

    const from = options.start + (elapsed / total) * span;
    elapsed += chunkWeight;
    const to = options.start + (elapsed / total) * span;

    pieces.push({
      text: chunk.join(" "),
      start: Number(from.toFixed(3)),
      end: Number(to.toFixed(3)),
    });
  }

  return pieces;
}

/**
 * Los trozos con los tiempos **reales** de cada palabra.
 *
 * Es la versión exacta, y la que hay que usar siempre que se pueda: el generador
 * de voz devuelve cuándo empieza y acaba cada palabra, así que no hay nada que
 * estimar. Repartir el tramo a ojo encaja el principio y el final del trozo pero
 * se desvía por dentro, y ahí es donde se nota que va desincronizado.
 *
 * Solo sirve cuando lo escrito coincide con lo hablado. Una toma con `sub`
 * —«MCT» escrito, «eme ce te» hablado— tiene distinto número de palabras y no se
 * pueden emparejar; esas se reparten, que para un trozo corto es suficiente.
 */
export function piecesFromWords(words: TimedWord[], perLine = WORDS_PER_LINE): CaptionPiece[] {
  const usable = words.filter((word) => word.word.trim() && word.end > word.start);
  const size = Math.max(1, perLine);
  const pieces: CaptionPiece[] = [];

  for (let index = 0; index < usable.length; index += size) {
    const chunk = usable.slice(index, index + size);

    pieces.push({
      text: chunk.map((word) => word.word.trim()).join(" "),
      start: Number(chunk[0].start.toFixed(3)),
      end: Number(chunk[chunk.length - 1].end.toFixed(3)),
    });
  }

  return pieces;
}

/**
 * Las palabras que caen dentro de una toma.
 *
 * Se compara contra el tramo de la toma con un margen pequeño: los cortes salen
 * de esas mismas palabras, así que coinciden — pero redondear a milisegundos
 * puede dejar la primera o la última justo fuera por una milésima.
 */
export function wordsWithin(words: TimedWord[], start: number, end: number): TimedWord[] {
  const margin = 0.02;

  return words.filter((word) => word.start >= start - margin && word.end <= end + margin);
}

/**
 * Un fotograma de subtítulo: el trozo entero con **una** palabra encendida.
 *
 * Es lo que separa un subtítulo que acompaña de uno que solo está ahí. La
 * palabra que suena se pinta en amarillo y un poco más grande, y las de al lado
 * se quedan en blanco: la vista va sola detrás de la que cambia, así que se lee
 * al ritmo de la voz sin esfuerzo.
 */
export interface CaptionFrame {
  /** Las palabras del trozo, todas. */
  words: string[];
  /** Cuál está sonando. */
  active: number;
  start: number;
  end: number;
}

/**
 * Reparte el trozo en un fotograma por palabra.
 *
 * El reparto es **proporcional a lo larga que es cada palabra**, no a partes
 * iguales. «de» y «convertirla» no se tardan lo mismo en decir, y con partes
 * iguales el resaltado se adelanta en las largas y se atrasa en las cortas — que
 * es exactamente cuando se nota que va mal.
 */
export function captionFrames(piece: CaptionPiece): CaptionFrame[] {
  const words = piece.text.trim().split(/\s+/).filter(Boolean);
  const span = piece.end - piece.start;

  if (words.length === 0 || span <= 0) return [];

  // Se cuenta una letra de más por palabra: la pausa entre palabras existe y sin
  // ella las de una sola letra salen casi instantáneas.
  const weights = words.map((word) => word.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const frames: CaptionFrame[] = [];
  let elapsed = 0;

  for (const [index, weight] of weights.entries()) {
    const start = piece.start + (elapsed / total) * span;
    elapsed += weight;
    const end = piece.start + (elapsed / total) * span;

    frames.push({
      words,
      active: index,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    });
  }

  return frames;
}

/**
 * El SVG de un trozo de subtítulo, al estilo de los vídeos verticales.
 *
 * Cuatro decisiones y cada una tapa un fallo distinto:
 *
 * - **Grande y en mayúsculas.** Ocupa el ancho de la pantalla. Un subtítulo
 *   pequeño de película se lee si uno se fija; el de un anuncio tiene que leerse
 *   sin querer, mientras se pasa de largo.
 * - **Borde grueso del color del fondo.** Sin él, el blanco sobre una escena
 *   clara desaparece — y media escena de un anuncio de suplementos es clara.
 * - **Sombra debajo.** Separa el texto de la imagen aunque el borde coincida en
 *   tono con lo que hay detrás.
 * - **A dos tercios de altura, no pegado abajo.** En el móvil, la franja de
 *   abajo la tapan la interfaz de la red social y el pulgar.
 *
 * El texto se escapa: un guion con un `&` o un `<` rompería el SVG entero y la
 * imagen saldría vacía sin que nada avisara.
 */
export function captionSvg(options: {
  words: string[];
  /** Cuál está sonando. `-1` para no encender ninguna. */
  active?: number;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  /** El color de la palabra que suena. */
  accent?: string;
  upper?: boolean;
}): string {
  const size = options.fontSize ?? Math.round(options.width * 0.105);
  const color = options.color ?? "#ffffff";
  const stroke = options.strokeColor ?? "#000000";
  const accent = options.accent ?? "#ffe11a";
  const active = options.active ?? -1;

  const words =
    options.upper === false ? options.words : options.words.map((word) => word.toUpperCase());

  /*
   * La que suena, más grande.
   *
   * Un 14 % basta: se nota el salto y no descoloca la línea. Más la levanta
   * sobre las de al lado y el renglón deja de leerse como una frase.
   */
  const bigger = Math.round(size * 1.14);

  const lines = wrapWords(words, 14);
  const lineHeight = Math.round(bigger * 1.12);

  // A dos tercios: abajo del todo lo tapan la interfaz de la red y el pulgar.
  const first = Math.round(options.height * 0.68) - Math.round((lineHeight * lines.length) / 2);

  let index = -1;

  const tspans = lines
    .map((line, row) => {
      const inner = line
        .map((word) => {
          index += 1;
          const on = index === active;

          return `<tspan fill="${on ? accent : color}" font-size="${on ? bigger : size}">${escapeXml(word)}</tspan>`;
        })
        // El espacio va fuera del `tspan` para que no herede su tamaño: dentro,
        // el de la palabra grande abre un hueco que se ve como un salto.
        .join(" ");

      return `<tspan x="${options.width / 2}" y="${first + lineHeight * (row + 1)}">${inner}</tspan>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(size * 0.06)}" stdDeviation="${Math.round(size * 0.05)}" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <text text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" letter-spacing="${Math.round(size * 0.01)}"
        fill="${color}" stroke="${stroke}"
        stroke-width="${Math.max(4, Math.round(size * 0.16))}"
        paint-order="stroke fill" filter="url(#s)">${tspans}</text>
</svg>`;
}

/** Parte una lista de palabras en líneas, sin cortar ninguna. */
export function wrapWords(words: string[], maxChars: number): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let length = 0;

  for (const word of words) {
    const next = length === 0 ? word.length : length + 1 + word.length;

    if (next > maxChars && current.length > 0) {
      lines.push(current);
      current = [word];
      length = word.length;
    } else {
      current.push(word);
      length = next;
    }
  }

  if (current.length > 0) lines.push(current);

  return lines;
}

/** Parte en líneas sin cortar palabras. */
export function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];

  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);

  return lines;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


/* ----------------------------- El archivo de subtítulos -------------------- */

/**
 * Los trozos, en formato SRT.
 *
 * Es lo que permite quedarse con lo mejor de los dos lados: **nuestro texto** y
 * **su animación**. El servicio de subtítulos sabe transcribir el audio solo,
 * pero eso aquí es un error — el guion va escrito fonético para que la voz
 * pronuncie bien, así que escribiría «eme ce te» donde tiene que poner «MCT».
 * Dándole el SRT hecho, se salta la transcripción y solo pone el estilo.
 *
 * Los tiempos salen de los cortes de voz que ya teníamos, que son exactos porque
 * vienen de los tiempos por palabra del propio audio.
 */
export function buildSrt(pieces: CaptionPiece[]): string {
  return pieces
    .filter((piece) => piece.end > piece.start && piece.text.trim())
    .map(
      (piece, index) =>
        `${index + 1}\n${srtTime(piece.start)} --> ${srtTime(piece.end)}\n${piece.text.trim()}\n`,
    )
    .join("\n");
}

/** `00:01:23,456`, que es el único formato que entiende un SRT. */
export function srtTime(seconds: number): string {
  const safe = Math.max(0, seconds);

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);

  const pad = (value: number, size = 2) => String(value).padStart(size, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(rest)},${pad(millis, 3)}`;
}

/**
 * Los estilos de subtítulo que se pueden elegir.
 *
 * Son los del servicio, y aquí se listan los que van con un anuncio vertical:
 * los que animan palabra a palabra. Los demás existen pero son de documental
 * —quietos y pequeños— que es justo lo que no sirve.
 */
export const SUBTITLE_PRESETS: { id: string; label: string; note: string }[] = [
  { id: "hustle", label: "Hustle", note: "Palabra a palabra, grande y con rebote. El de los anuncios." },
  { id: "slay", label: "Slay", note: "Resalta con color la palabra que está sonando." },
  { id: "glide", label: "Glide", note: "Entra deslizando, más suave que los de rebote." },
  { id: "fusion", label: "Fusion", note: "Lleva fondo detrás del texto: se lee sobre cualquier imagen." },
  { id: "backdrop", label: "Backdrop", note: "Caja sólida detrás. El más legible de todos." },
  { id: "vegas", label: "Vegas", note: "Muy marcado y con mucho color, para ganchos cortos." },
  { id: "simple", label: "Simple", note: "Blanco con borde y sin animación, por si molesta el movimiento." },
];
