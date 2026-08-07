/**
 * Adaptar una imagen ajena poniéndole tu producto.
 *
 * Sin imports, probado en `image-adapt.test.ts`.
 *
 * ## Qué hace y por qué así
 *
 * Coge una imagen de referencia y la reescribe con **tu** envase: mismo montaje,
 * misma luz, mismo encuadre, otro producto. Es el paso que convierte una maqueta
 * prestada en material propio, y es justo lo que faltaba — una página con el
 * frasco de otra marca anuncia algo distinto de lo que llega en el paquete.
 *
 * ## El texto de la imagen se mira antes de tocar nada
 *
 * Muchas imágenes de una tienda llevan texto incrustado: «Reduce cellulite»,
 * «100% Vegan», el nombre de la marca. Reescribirlo entero siempre sería tirar
 * lo que sirve, y dejarlo siempre sería anunciar lo que tu producto no hace.
 *
 * Así que primero se lee y se decide por trozos. Un sello de «Sin azúcar» vale
 * igual para casi cualquier suplemento; una promesa clínica concreta y el nombre
 * de la otra marca, no. Lo que encaja se conserva, lo que no se sustituye por lo
 * que sostenga la investigación propia.
 */

/* ------------------------------ El tamaño real ----------------------------- */

/**
 * Las proporciones que aceptan los modelos de imagen.
 *
 * No es una lista de gustos: pedir una que no está hace fallar la generación, y
 * pedir una distinta de la del original devuelve la escena recortada o estirada,
 * que en una foto de producto se ve enseguida.
 */
export const RATIOS: { name: string; value: number }[] = [
  { name: "1:1", value: 1 },
  { name: "4:5", value: 4 / 5 },
  { name: "2:3", value: 2 / 3 },
  { name: "9:16", value: 9 / 16 },
  { name: "3:2", value: 3 / 2 },
  { name: "16:9", value: 16 / 9 },
];

/** La proporción admitida más cercana a la de la imagen original. */
export function nearestRatio(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return "1:1";

  const actual = width / height;

  return RATIOS.reduce((best, ratio) =>
    Math.abs(ratio.value - actual) < Math.abs(best.value - actual) ? ratio : best,
  ).name;
}

/**
 * El tipo de una imagen, leído de sus primeros bytes.
 *
 * Hace falta porque el modelo **comprueba** que el tipo declarado coincida con
 * el contenido y rechaza la petición si no: «the image was specified using the
 * image/jpeg media type, but the image appears to be a image/webp image». Con
 * el tipo puesto a mano, un lote entero de imágenes de tienda —que suelen ser
 * webp— falla completo, una por una y con el mismo error nueve veces.
 *
 * Se lee de los bytes y no del nombre del archivo ni de la cabecera de la
 * respuesta: la extensión la pone quien subió el archivo y el `content-type` lo
 * pone el servidor, y cualquiera de los dos puede mentir. Los bytes no.
 *
 * Si no se reconoce se devuelve `null`, para que quien llame decida — no un
 * tipo por defecto, que es justo el fallo que esto viene a arreglar.
 */
export function imageMediaType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  const empieza = (...esperados: number[]) => esperados.every((b, i) => bytes[i] === b);

  if (empieza(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (empieza(0x47, 0x49, 0x46, 0x38)) return "image/gif";

  // WebP se anuncia en dos sitios: «RIFF» al principio y «WEBP» en el byte 8.
  // Mirar solo el primero lo confundiría con un wav o un avi.
  if (empieza(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return "image/webp";
  }

  return null;
}

/**
 * El tamaño de una imagen, leído de sus primeros bytes.
 *
 * Se lee del archivo y no del atributo `width` del HTML porque ese lo escribe
 * quien hizo la página y a menudo miente —o no está—. La proporción es lo único
 * que decide si la imagen generada encaja en el hueco, así que conviene sacarla
 * de la fuente.
 */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: la cabecera IHDR va siempre en la misma posición.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: dos enteros de 16 bits en little-endian.
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // WebP en su variante simple.
  if (
    bytes.length > 30 &&
    bytes[0] === 0x52 &&
    bytes[8] === 0x57 &&
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38 &&
    bytes[15] === 0x20
  ) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(view, bytes);

  return null;
}

/**
 * El tamaño de un JPEG, recorriendo sus marcadores.
 *
 * Un JPEG no lo lleva en un sitio fijo: hay que saltar de marcador en marcador
 * hasta dar con el que describe la trama. Los `SOF` que valen son varios —hay
 * distintos tipos de compresión— y los que empiezan por `0xC4`, `0xC8` y `0xCC`
 * **no** son de trama aunque caigan en el mismo rango, que es el fallo clásico
 * al escribir esto.
 */
function jpegSize(view: DataView, bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }

    const length = view.getUint16(offset + 2);
    if (length < 2) return null;

    offset += 2 + length;
  }

  return null;
}

/* --------------------------- Leer lo que dice la imagen -------------------- */

export interface ImageReading {
  /** Qué se ve, en una frase: el montaje, la luz, el encuadre. */
  scene: string;
  /** El texto incrustado, literal. Vacío si no lleva. */
  text: string;
  /**
   * Si ese texto vale tal cual para el producto propio.
   *
   * Un sello de «Sin azúcar» suele valer; una promesa clínica concreta o el
   * nombre de la otra marca, no.
   */
  textFits: boolean;
  /** Por qué encaja o por qué no. */
  textReason: string;
  /** El texto que debería llevar, cuando el suyo no vale. */
  suggestedText: string;
  /** Nombres de marca o de producto que aparecen y hay que quitar. */
  brandNames: string[];
}

export function buildReadingPrompt(productName: string, productContext: string): string {
  return `Mira esta imagen. Es de otra marca y se va a rehacer con **${productName}** en lugar de su producto.

${productContext}

Devuelve:

- **scene**: qué se ve y cómo está hecha. El montaje, la luz, el encuadre, qué acompaña al producto. Lo que haría falta para volver a montarla.
- **text**: el texto incrustado en la imagen, **literal y entero**. Sellos, cifras, titulares, lo que ponga la etiqueta. Vacío si no lleva ninguno.
- **textFits**: si ese texto vale **tal cual** para este producto.
- **textReason**: por qué. Sé concreto: «"Sin azúcar" y "Vegano" valen; "Reduce la celulitis" es una promesa que esta investigación no sostiene».
- **suggestedText**: si no vale, qué debería poner en su lugar — mismo sitio, misma longitud aproximada, y solo lo que esta investigación sostiene. Vacío si el suyo vale.
- **brandNames**: los nombres de marca o de producto que aparezcan. Van fuera sí o sí.

## Cómo decidir si el texto vale

Vale lo genérico y comprobable de este producto: formatos, sellos de dieta, cantidades que coincidan, garantías que también des tú.

No vale nada que nombre a la otra marca, ninguna promesa clínica que esta investigación no sostenga, y ninguna cifra de resultados que no sea tuya. **Ante la duda, no vale**: una imagen con una promesa que el producto no cumple es una devolución.`;
}

/* --------------------------- El encargo de la imagen ----------------------- */

export type AdaptMode = "nueva" | "mejorar";

/**
 * Lo que se le pide al modelo de imagen.
 *
 * El envase va **siempre** por referencia y nunca descrito. Un envase escrito
 * con palabras sale inventado, y un envase inventado en una ficha de producto es
 * una devolución: el cliente recibe algo que no se parece a lo que vio.
 */
export function buildEditPrompt(options: {
  reading: ImageReading;
  productName: string;
  /** Lo que pida quien lo usa, cuando pide otra pasada. */
  extra?: string;
  mode?: AdaptMode;
}): string {
  const { reading, productName } = options;

  const parts: string[] = [
    options.mode === "mejorar"
      ? `Mejora esta imagen conservando su composición: mismo encuadre, misma luz, mismo reparto.`
      : `Rehaz esta imagen con otro producto, conservando el montaje: mismo encuadre, misma luz, mismo fondo, mismos elementos alrededor.`,
    `El producto pasa a ser ${productName}, **exactamente el de la imagen de referencia adjunta**: misma forma de envase, misma tapa, misma etiqueta.`,
  ];

  if (reading.text) {
    if (reading.textFits) {
      parts.push(
        `Conserva el texto que ya lleva, en el mismo sitio y con el mismo estilo. No lo reescribas ni lo traduzcas.`,
      );
    } else if (reading.suggestedText) {
      parts.push(
        `Sustituye el texto por: «${reading.suggestedText}». En el mismo sitio y con el mismo estilo tipográfico que tenía.`,
      );
    } else {
      parts.push(`Quita el texto de la imagen y deja la escena limpia.`);
    }
  }

  if (reading.brandNames.length > 0) {
    /*
     * Los nombres se nombran uno a uno.
     *
     * «Quita las marcas» es una instrucción que el modelo cumple a medias: deja
     * el logotipo pequeño de la esquina o el nombre grabado en la tapa. Diciendo
     * cuáles son, los quita.
     */
    parts.push(
      `No puede aparecer por ningún sitio: ${reading.brandNames.join(", ")}. Ni en la etiqueta, ni en la tapa, ni en un sello, ni de fondo.`,
    );
  }

  if (options.extra?.trim()) parts.push(options.extra.trim());

  parts.push(
    `NO: envases distintos al de la referencia, texto inventado, marcas de agua, logotipos ajenos, manos deformes, estética de banco de imágenes.`,
  );

  return parts.join("\n\n");
}

/* -------------------------------- El repaso -------------------------------- */

/**
 * Lo que hay que mirar antes de dar una adaptación por buena.
 *
 * Es barato y caza lo que después cuesta caro: una marca ajena que sigue ahí, un
 * texto que promete lo que el producto no hace.
 */
export function reviewReading(reading: ImageReading): string[] {
  const warnings: string[] = [];

  if (reading.text && reading.textFits && reading.brandNames.length > 0) {
    warnings.push(
      "Dice que el texto vale tal cual, pero también que aparece una marca ajena. Revísalo: no puede ser las dos cosas.",
    );
  }

  if (reading.text && !reading.textFits && !reading.suggestedText) {
    warnings.push("El texto no vale y no propuso otro: la imagen saldrá sin él.");
  }

  if (!reading.scene.trim()) {
    warnings.push("No describió la escena; la imagen puede salir muy distinta.");
  }

  return warnings;
}

/**
 * Los modelos de imagen que sirven para adaptar, por orden de preferencia.
 *
 * Nano Banana es el que entiende «esta escena, con este producto» a partir de
 * dos referencias, que es justo lo que hace la adaptación.
 */
const PREFERIDOS = ["nano-banana-pro", "nano-banana-2", "nano-banana"];

/**
 * Cuál usar de los que el CLI dice tener.
 *
 * El modelo estaba escrito a fijo y el CLI contestaba `No model with job_type
 * "nano-banana-pro"`: los nombres cambian cuando Higgsfield renombra o retira
 * uno, y entonces no falla una imagen, deja de funcionar la pantalla entera.
 *
 * Ante un nombre que no está se prefiere seguir con otro modelo a no generar
 * nada: una imagen adaptada con el segundo de la lista sirve, y ninguna no.
 */
export function pickImageModel(available: string[]): string | null {
  const limpios = available.filter(Boolean);

  if (limpios.length === 0) return null;

  const exacto = PREFERIDOS.find((preferido) => limpios.includes(preferido));

  if (exacto) return exacto;

  /*
   * Un nombre que empieza igual antes que uno cualquiera.
   *
   * Las versiones nuevas llegan como `nano-banana-pro-v2` o con la fecha
   * detrás: es el mismo modelo y sigue sirviendo, mientras que el primero de
   * la lista podría ser cualquier cosa.
   */
  for (const preferido of PREFERIDOS) {
    const parecido = limpios.find((slug) => slug.startsWith(preferido));

    if (parecido) return parecido;
  }

  return limpios[0];
}
