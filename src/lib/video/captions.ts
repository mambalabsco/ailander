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
  const pieces: CaptionPiece[] = [];

  for (let index = 0; index < words.length; index += perLine) {
    const chunk = words.slice(index, index + perLine);

    // Proporcional a cuántas palabras lleva el trozo, no a partes iguales: el
    // último puede tener una sola palabra y no debe durar lo mismo que cuatro.
    const from = options.start + (index / words.length) * span;
    const to = options.start + ((index + chunk.length) / words.length) * span;

    pieces.push({
      text: chunk.join(" "),
      start: Number(from.toFixed(3)),
      end: Number(to.toFixed(3)),
    });
  }

  return pieces;
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
  text: string;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  /** El color de las palabras que se quieren destacar. */
  accent?: string;
  upper?: boolean;
}): string {
  const size = options.fontSize ?? Math.round(options.width * 0.105);
  const color = options.color ?? "#ffffff";
  const stroke = options.strokeColor ?? "#000000";

  const text = options.upper === false ? options.text : options.text.toUpperCase();

  const lines = wrap(text, 14);
  const lineHeight = Math.round(size * 1.12);

  // A dos tercios: abajo del todo lo tapan la interfaz de la red y el pulgar.
  const first = Math.round(options.height * 0.68) - Math.round((lineHeight * lines.length) / 2);

  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${options.width / 2}" y="${first + lineHeight * (index + 1)}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(size * 0.06)}" stdDeviation="${Math.round(size * 0.05)}" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <text text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-size="${size}" font-weight="900" letter-spacing="${Math.round(size * 0.01)}"
        fill="${options.accent ?? color}" stroke="${stroke}"
        stroke-width="${Math.max(4, Math.round(size * 0.16))}"
        paint-order="stroke fill" filter="url(#s)">${tspans}</text>
</svg>`;
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
