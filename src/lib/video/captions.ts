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
 * voz. Tres o cuatro palabras cada vez van al ritmo de lo que se oye, que es lo
 * que hace que se sigan sin esfuerzo.
 */

/** Palabras por trozo. Cuatro es lo que cabe en una línea de vídeo vertical. */
export const WORDS_PER_LINE = 4;

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
 * El SVG de un trozo de subtítulo.
 *
 * Se dibuja con un borde grueso del color de fondo por debajo del relleno. Sin
 * él, un subtítulo blanco sobre una escena clara desaparece — y las escenas
 * claras son la mitad de un anuncio de suplementos.
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
}): string {
  const size = options.fontSize ?? Math.round(options.width * 0.062);
  const color = options.color ?? "#ffffff";
  const stroke = options.strokeColor ?? "#000000";

  const lines = wrap(options.text, 18);
  const lineHeight = Math.round(size * 1.25);

  // Ancladas abajo, que es donde se leen sin tapar la cara de quien habla.
  const first = options.height - lineHeight * lines.length - Math.round(size * 0.6);

  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${options.width / 2}" y="${first + lineHeight * (index + 1)}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">
  <text text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700"
        fill="${color}" stroke="${stroke}" stroke-width="${Math.max(2, Math.round(size * 0.14))}"
        paint-order="stroke fill">${tspans}</text>
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
