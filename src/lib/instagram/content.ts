/**
 * Piezas de Instagram a partir de un producto.
 *
 * Aquí se decide **qué se publica y cómo está escrito**. Ni se genera la media
 * ni se habla con Meta: eso viene después y por su cuenta.
 *
 * ## Los límites son de Instagram, no de gusto
 *
 * El pie admite 2.200 caracteres y 30 etiquetas, y **corta a los ~125** con un
 * «más» que casi nadie pulsa. Así que la primera línea no es el principio del
 * texto: es lo único que se lee. Escrito sin saberlo, el gancho queda detrás del
 * corte y la publicación no dice nada.
 */

export const CAPTION_MAX = 2_200;
export const HASHTAG_MAX = 30;
/** Lo que se ve antes del «más». Es la única línea garantizada. */
export const VISIBLE_MAX = 125;

export interface Format {
  id: string;
  label: string;
  aspectRatio: string;
  note: string;
  /** Segundos, cuando es vídeo. */
  seconds?: [number, number];
}

export const FORMATS: Format[] = [
  {
    id: "feed",
    label: "Foto de feed",
    aspectRatio: "4:5",
    note: "La vertical ocupa más pantalla que la cuadrada, y en el muro eso es tiempo de lectura.",
  },
  {
    id: "carrusel",
    label: "Carrusel",
    aspectRatio: "4:5",
    note: "Para lo que necesita orden: pasos, antes y después, comparativa. Se desliza porque hay una razón para pasar.",
  },
  {
    id: "reel",
    label: "Reel",
    aspectRatio: "9:16",
    seconds: [3, 90],
    note: "Lo único que alcanza a quien no te sigue. El primer segundo decide.",
  },
  {
    id: "historia",
    label: "Historia",
    aspectRatio: "9:16",
    seconds: [1, 60],
    note: "Dura un día y la ve quien ya te sigue: sirve para recordar y para preguntar, no para convencer.",
  },
];

export const findFormat = (id: string): Format =>
  FORMATS.find((one) => one.id === id) ?? FORMATS[0];

export interface Caption {
  text: string;
  hashtags: string[];
}

/** Las etiquetas, normalizadas: sin repetir, sin almohadilla doble, en minúsculas. */
export function cleanHashtags(tags: string[]): string[] {
  const out: string[] = [];

  for (const raw of tags) {
    const one = raw
      .trim()
      .toLowerCase()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");

    if (!one || out.includes(one)) continue;

    out.push(one);

    // Pasar de treinta no da error: Instagram las ignora **todas**. Callarse el
    // exceso saldría como una publicación sin ninguna etiqueta.
    if (out.length >= HASHTAG_MAX) break;
  }

  return out;
}

/**
 * El pie completo, ya recortado a lo que admite.
 *
 * Las etiquetas van al final y separadas por una línea en blanco: mezcladas con
 * el texto lo vuelven ilegible, y en la vista cortada ocupan el sitio del
 * gancho.
 *
 * Si el conjunto no cabe se recorta **el texto** y no las etiquetas: el texto ya
 * dijo lo suyo en la primera línea, y unas etiquetas a medias no clasifican
 * nada.
 */
export function buildCaption(caption: Caption): string {
  const tags = cleanHashtags(caption.hashtags);
  const cola = tags.length > 0 ? `\n\n${tags.map((one) => `#${one}`).join(" ")}` : "";

  const sitio = CAPTION_MAX - cola.length;
  const texto = caption.text.trim();

  return (texto.length <= sitio ? texto : texto.slice(0, sitio).trimEnd()) + cola;
}

/** Lo que se lee sin pulsar «más». Sirve para enseñarlo en la vista previa. */
export function visiblePart(caption: string): string {
  const clean = caption.trim();

  if (clean.length <= VISIBLE_MAX) return clean;

  const cut = clean.slice(0, VISIBLE_MAX);
  const space = cut.lastIndexOf(" ");

  return (space > 0 ? cut.slice(0, space) : cut).trimEnd();
}

export function buildContentPrompt(input: {
  format: Format;
  productName: string;
  audience: string;
  country: string;
  count: number;
  context?: string;
}): string {
  return [
    `Eres quien lleva el Instagram de una marca de producto.`,
    ``,
    `Escribe ${input.count} publicaciones de ${input.productName} para ${input.audience} en ${input.country}.`,
    `Formato: ${input.format.label}. ${input.format.note}`,
    ``,
    ...(input.context ? [`## Sobre el producto`, ``, input.context, ``] : []),
    `## Cada publicación lleva`,
    ``,
    `1. **La primera línea**, de menos de ${VISIBLE_MAX} caracteres. Es lo único que se lee sin pulsar «más»: tiene que funcionar sola.`,
    `2. **El cuerpo**, hasta ${CAPTION_MAX} caracteres contando todo.`,
    `3. **Qué se ve**, descrito para poder generarlo: qué hay en el encuadre, no qué se siente.`,
    `4. Si el **producto aparece** o no, y si se ve mejor en **imagen o en vídeo**.`,
    ...(input.format.seconds
      ? [
          `   Dura entre ${input.format.seconds[0]} y ${input.format.seconds[1]} segundos, y el primero decide.`,
        ]
      : []),
    `5. **Etiquetas**: entre cinco y quince, sin almohadilla. Mezcla las de categoría con las del problema que resuelve; las de millones de publicaciones no clasifican nada.`,
    ``,
    `## Cómo`,
    ``,
    `- **Cada una distinta a las demás.** Una cuenta donde todas las fotos son el envase sobre una mesa se lee como un catálogo, y un catálogo no se sigue. Reparte entre: alguien usándolo, un momento del problema sin producto a la vista, un detalle macro, una escena de la vida diaria del público, un antes y después, algo del proceso o del ingrediente.`,
    `- **El producto no tiene por qué salir.** En la mayoría no sale: sale la persona, el momento o el problema. Dilo en «showsProduct».`,
    `- Lo que es una **historia con principio y final** pídelo en vídeo; lo que es una imagen fija que se entiende de un vistazo, en imagen.`,
    `- Una idea por publicación. Dos ideas en un pie son cero ideas.`,
    `- Sin «link en bio» como única llamada: di qué gana quien haga el gesto que le pides.`,
    `- Sin promesas de curar, revertir o eliminar enfermedades.`,
    `- Nada de cifras de clientes o reseñas que no te haya dado el contexto.`,
    `- Escribe en el español de ${input.country}.`,
  ].join("\n");
}

/**
 * En qué insistir esta tanda, con las palabras de quien lo pidió.
 *
 * ## Por qué literal y no reformulado
 *
 * Porque «insiste en el sueño» y «habla del descanso nocturno» no piden lo
 * mismo, y quien dijo lo primero no reconoce lo segundo en lo que sale. El
 * encargo lo repite tal cual y deja que el modelo lo interprete una sola vez,
 * no dos.
 */
export function buildFocusNote(focus: string): string {
  const limpio = focus.trim();

  if (!limpio) return "";

  return [
    `## En qué insistir`,
    ``,
    `«${limpio}»`,
    ``,
    `Vale para **todas** las piezas de esta tanda, no para una. No es el tema de`,
    `cada publicación: es el ángulo desde el que se mira lo que ya ibas a contar.`,
  ].join("\n");
}
