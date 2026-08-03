/**
 * Bajarle el volumen a un WAV.
 *
 * Sin imports, probado en `wav-gain.test.ts`.
 *
 * ## Por qué hace falta esto
 *
 * El montaje mezcla pistas y **no tiene control de volumen**: mete la música al
 * nivel al que venga. Una pista generada viene a volumen de canción, así que
 * tapa la voz y el anuncio deja de entenderse — que es el único fallo que hace
 * inútil un vídeo entero.
 *
 * Como no se puede ajustar al mezclar, se ajusta antes: se le baja el volumen al
 * archivo. Un WAV es de los pocos formatos donde eso son diez líneas — la
 * cabecera dice dónde empiezan las muestras y cada muestra es un entero que se
 * multiplica.
 *
 * ## Cuánto se baja
 *
 * A un 12 %. Es el rango en el que una cama musical se oye pero no compite: por
 * encima del 20 % empieza a comerse las consonantes de la voz, y por debajo del
 * 8 % no se distingue de no tener música.
 */

/** El volumen al que una cama musical acompaña sin tapar la voz. */
export const MUSIC_GAIN = 0.12;

interface WavInfo {
  /** Dónde empiezan las muestras. */
  dataOffset: number;
  dataLength: number;
  bitsPerSample: number;
}

/**
 * Encuentra el trozo de muestras recorriendo los bloques del archivo.
 *
 * No vale asumir que empieza en el byte 44. Esa es la posición del WAV más
 * simple, pero muchos generadores meten bloques de metadatos antes —el nombre
 * del programa, la fecha— y entonces el byte 44 cae en mitad de un texto: al
 * multiplicarlo se destroza el audio en vez de bajarle el volumen.
 */
function readWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const tag = (offset: number) =>
    String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let offset = 12;
  let bitsPerSample = 16;

  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt " && body + 16 <= bytes.length) {
      bitsPerSample = view.getUint16(body + 14, true);
    }

    if (id === "data") {
      return {
        dataOffset: body,
        dataLength: Math.min(size, bytes.length - body),
        bitsPerSample,
      };
    }

    // Los bloques van alineados a par: uno impar lleva un byte de relleno que no
    // cuenta en su tamaño, y sin sumarlo se pierde el hilo del recorrido.
    offset = body + size + (size % 2);
  }

  return null;
}

/**
 * Devuelve el mismo WAV con las muestras multiplicadas.
 *
 * Si el archivo no se puede leer se devuelve tal cual: es preferible una música
 * demasiado alta —que se oye y se arregla subiendo otra— a un archivo destrozado
 * que suena a estática y parece un fallo del montaje.
 *
 * Solo toca los de 16 bits, que es lo que devuelven los generadores. Otro ancho
 * se deja intacto en vez de interpretarlo mal.
 */
export function attenuateWav(bytes: Uint8Array, gain = MUSIC_GAIN): Uint8Array {
  const info = readWav(bytes);
  if (!info || info.bitsPerSample !== 16) return bytes;

  const out = bytes.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  const end = info.dataOffset + info.dataLength - 1;

  for (let offset = info.dataOffset; offset < end; offset += 2) {
    const sample = view.getInt16(offset, true) * gain;

    // Se recorta antes de escribir: un valor fuera de rango da la vuelta al
    // entero y suena como un chasquido, justo en los picos.
    view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample))), true);
  }

  return out;
}

/* ------------------------- Qué música pedirle al modelo -------------------- */

/**
 * El encargo de la música, a partir de lo que vende el anuncio.
 *
 * Se pide **instrumental y sin protagonismo** siempre. Una cama con voz compite
 * con la locución por el mismo sitio del oído, y una melodía con gancho se lleva
 * la atención justo cuando se está contando el mecanismo.
 */
export function buildMusicPrompt(options: {
  productName: string;
  audience: string;
  mood?: string;
}): string {
  const mood = options.mood?.trim() || "cálido y esperanzador, con un pulso constante que avanza";

  return [
    `Instrumental background bed for a direct-response supplement ad about ${options.productName}, aimed at ${options.audience}.`,
    `Mood: ${mood}.`,
    // Sin voces ni instrumento solista: la locución va encima.
    "No vocals, no singing, no spoken word, no prominent lead melody.",
    "Soft sustained pads, gentle low percussion, subtle warm bass.",
    "Even dynamics, no sudden hits, no drops, nothing that pulls attention from a voice-over.",
    "Loopable, consistent from start to end.",
  ].join(" ");
}
