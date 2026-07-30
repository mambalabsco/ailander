/**
 * Escenas visuales de una historia.
 *
 * Sin imports, como los otros motores puros, y probado en `story-beats.test.ts`.
 *
 * ## El problema que resuelve
 *
 * Hasta ahora las creatividades salían de una lista fija de conceptos —gancho,
 * reseña, comparativa— y del titular. En un long copy eso desperdicia lo único
 * que lo hace funcionar: **la historia ya contiene sus propias imágenes**. Si el
 * texto cuenta que se le caía el pelo en la ducha, la creatividad que para el
 * scroll es el desagüe de esa ducha, no un frasco sobre fondo blanco.
 *
 * Este archivo define qué es una escena aprovechable y cómo se convierte en un
 * prompt. La extracción la hace el modelo; aquí está el criterio.
 *
 * ## Por qué no vale «lo más impactante posible»
 *
 * Porque en anuncios de salud el impacto gráfico no es una palanca disponible:
 * Meta rechaza el contenido explícito, y por separado rechaza los anuncios que
 * insinúan consecuencias médicas. Una creatividad rechazada no tiene hook rate,
 * y las rechazadas en serie tumban la cuenta.
 *
 * Lo que sí para el scroll —y lo que se pide aquí— es la **interrupción de
 * patrón**: una imagen que no parece un anuncio. Un objeto cotidiano en el sitio
 * equivocado, un detalle demasiado cercano, un documento, una escena doméstica
 * sin posar. Eso rinde y además pasa revisión.
 */

/* --------------------------- Tipos de escena ------------------------------- */

export const BEAT_KINDS = [
  "momento-cero",
  "objeto-testigo",
  "documento",
  "descubrimiento",
  "mecanismo",
  "vida-despues",
  "retrato",
] as const;

export type BeatKind = (typeof BEAT_KINDS)[number];

export interface BeatMeta {
  label: string;
  /** Qué escena buscar en el texto. */
  looksFor: string;
  /** Por qué esta escena para el scroll. */
  whyItStops: string;
  /** Encuadre habitual. */
  aspectRatio: "1:1" | "4:5" | "9:16";
  /** Si el producto tiene que salir. */
  showsProduct: boolean;
}

/**
 * Las siete escenas que tiene toda historia de respuesta directa.
 *
 * Están en el orden en que aparecen en el texto, no por rendimiento: la idea es
 * recorrer la historia y sacar de cada tramo su imagen, en vez de encajar la
 * historia en una plantilla.
 *
 * **Ninguna de las siete es el producto sobre fondo blanco.** Esa foto ya existe
 * y no para a nadie; sirve como referencia para las que sí.
 */
export const BEAT_META: Record<BeatKind, BeatMeta> = {
  "momento-cero": {
    label: "El momento exacto",
    looksFor:
      "El instante concreto en que el problema se hizo innegable. No «estaba cansada», sino la escena: sentada en el borde de la cama a las tres de la tarde, con la ropa del trabajo todavía puesta.",
    whyItStops:
      "Quien vive eso se reconoce en medio segundo. No parece un anuncio porque no lo parece: es un momento doméstico sin posar.",
    aspectRatio: "4:5",
    showsProduct: false,
  },
  "objeto-testigo": {
    label: "El objeto que lo delata",
    looksFor:
      "Un objeto cotidiano que cuenta el problema sin enseñar a nadie: el desagüe de la ducha, la báscula, la caja de pastillas a medias, la cama deshecha a mediodía, tres tallas de pantalón en la misma silla.",
    whyItStops:
      "Es la interrupción de patrón más fiable que existe: un objeto normal fotografiado demasiado de cerca. El cerebro se para a entender qué está mirando, y para entonces ya leyó el titular.",
    aspectRatio: "1:1",
    showsProduct: false,
  },
  documento: {
    label: "El documento",
    looksFor:
      "El papel que aparece en la historia: un análisis de sangre, una receta, una anotación en un cuaderno, un mensaje en el móvil, un resultado en la pantalla de la consulta.",
    whyItStops:
      "Un documento pide ser leído, y leerlo es tiempo de atención. Además ancla la historia en algo verificable en vez de en una promesa.",
    aspectRatio: "4:5",
    showsProduct: false,
  },
  descubrimiento: {
    label: "El descubrimiento",
    looksFor:
      "El punto de giro: cómo encontró la solución. Un artículo, una conversación, una consulta, un ingrediente sobre la mesa de la cocina.",
    whyItStops:
      "Es el momento de la historia que el lector quiere que le cuenten. La imagen abre la curiosidad en vez de cerrarla.",
    aspectRatio: "1:1",
    showsProduct: false,
  },
  mecanismo: {
    label: "Cómo funciona",
    looksFor:
      "El mecanismo explicado de forma visual y **exacta**: el órgano o el proceso del que habla el texto, en estilo de ilustración médica o de diagrama, sereno y clínico.",
    whyItStops:
      "La gente con una condición real busca entenderla. Una ilustración anatómica correcta da autoridad; una imagen quirúrgica dramática da rechazo y rechazo de Meta.",
    aspectRatio: "1:1",
    showsProduct: false,
  },
  "vida-despues": {
    label: "La vida después",
    looksFor:
      "La escena concreta que la historia usa como resultado. No «se siente mejor», sino qué hace ahora que antes no hacía, en un momento cotidiano.",
    whyItStops:
      "El contraste con la primera escena es lo que convierte una promesa en una historia. Y es un resultado de vida, no de salud, que es lo que se puede prometer.",
    aspectRatio: "4:5",
    showsProduct: true,
  },
  retrato: {
    label: "Retrato de quien lo cuenta",
    looksFor:
      "La persona de la historia, en su casa, con luz natural, mirando a cámara. Ni sonrisa de catálogo ni sufrimiento actuado.",
    whyItStops:
      "Una cara real y una mirada directa es lo más antiguo y lo que mejor funciona. Falla cuando parece de banco de imágenes, y esa es toda la diferencia.",
    aspectRatio: "9:16",
    showsProduct: false,
  },
};

/* ------------------------------- Intensidad --------------------------------- */

export const INTENSITIES = ["suave", "crudo", "muy-crudo"] as const;

export type Intensity = (typeof INTENSITIES)[number];

export interface IntensityMeta {
  label: string;
  description: string;
  /** Lo que se le añade al prompt de cada escena. */
  direction: string;
}

/**
 * Cuánto se permite que incomode una escena.
 *
 * **Lo que sube no es el gore: es la falta de maquillaje.** Una escena cruda es
 * la que no se ha limpiado para la cámara —la casa desordenada, la cara sin
 * dormir, la cicatriz que existe— y ese es el eje que de verdad separa una foto
 * que parece real de una que parece un anuncio.
 *
 * Subir por el eje del gore va en la dirección contraria de lo que se busca: una
 * imagen explícita hace que el ojo **aparte la mirada**, que es lo opuesto a
 * pararse. Y en salud, además, Meta la rechaza y la creatividad no llega a
 * existir. Por eso ni siquiera «muy crudo» abre esa puerta: lo que abre es la
 * puerta de lo incómodo real.
 */
export const INTENSITY_META: Record<Intensity, IntensityMeta> = {
  suave: {
    label: "Suave",
    description: "Cotidiano y luminoso. Para públicos que aún no se reconocen en el problema.",
    direction:
      "Tono contenido y cotidiano. Luz natural agradable. La emoción se insinúa por el gesto y por el contexto, no por el dramatismo.",
  },
  crudo: {
    label: "Crudo",
    description: "Sin maquillar. La casa como está, la cara como está.",
    direction:
      "**Sin maquillar y sin ordenar.** La habitación como está de verdad: la cama sin hacer, los platos, la ropa en la silla. Cara sin maquillaje, ojeras, pelo sin arreglar. Luz dura o luz fea de bombilla, no de estudio. Encuadre imperfecto, ligeramente torcido, como una foto hecha con prisa desde el móvil. Nada en la escena debe parecer colocado para la foto.",
  },
  "muy-crudo": {
    label: "Muy crudo",
    description:
      "Angustia real y frialdad clínica. Cicatrices que existen, agotamiento sin filtro.",
    direction:
      `**Angustia real, sin suavizar nada.** Agotamiento visible hasta resultar incómodo: la persona sentada sin hacer nada, la mirada perdida, el cuerpo derrotado en una postura que nadie posaría. Las tres de la madrugada. Desorden acumulado de semanas.

**Frialdad clínica** donde toque: la camilla con el papel arrugado, la luz fluorescente que aplana la cara, el pasillo vacío, la sala de espera a las cuatro de la mañana con las sillas vacías.

**Si la persona de la historia tiene una cicatriz, se ve.** Una cicatriz de tiroidectomía en el cuello, ya curada, es real y es dura, y en un testimonio de alguien que pasó por eso es honesta. Cicatriz curada de alguien que cuenta su historia: sí. Herida, quirófano o sangre: no, nunca — el ojo aparta la mirada en vez de pararse, y Meta lo rechaza antes de que nadie lo vea.

Lo que sigue sin poder aparecer, aunque la intensidad sea la máxima: cualquier imagen que insinúe que a **quien mira** le va a pasar algo. La diferencia es «yo pasé por esto» contra «te va a pasar esto». La primera es un testimonio; la segunda es una amenaza que el producto no puede sostener, y es la que hunde la cuenta.`,
  },
};

/* ----------------------------- Lo que devuelve ------------------------------ */

export interface StoryBeat {
  kind: BeatKind;
  /** La frase literal del copy de la que sale esta escena. */
  quote: string;
  /** La escena en una frase, ya visual. */
  scene: string;
  /** Qué se ve, en detalle: encuadre, luz, objetos. */
  composition: string;
}

/* ------------------------- Lo que no se va a pedir -------------------------- */

/**
 * Lo que nunca entra en un prompt, y por qué.
 *
 * Los dos primeros bloques son política de Meta y por tanto una cuestión de que
 * el anuncio exista o no. Los otros dos son de rendimiento: son las razones por
 * las que una creatividad de salud parece un anuncio y se ignora.
 *
 * Se escribe explícitamente en cada prompt en vez de confiar en que el modelo lo
 * infiera. Un modelo al que le pides «una historia sobre tiroides» y le das
 * libertad acaba, con bastante probabilidad, en un quirófano.
 */
export const FORBIDDEN = [
  // Rechazo automático de Meta.
  "cirugía, quirófanos, incisiones, sangre, heridas, cicatrices quirúrgicas, amputaciones",
  "accidentes, cuerpos heridos, escenas de urgencias, cualquier imagen explícita o perturbadora",
  // Afirmaciones que el producto no puede sostener.
  "cualquier imagen que insinúe que no usar el producto lleva a una enfermedad grave, a una operación o a la muerte",
  "cualquier imagen que implique un diagnóstico, o que señale a la persona que mira como enferma",
  "básculas con cifras, partes del cuerpo aisladas, primeros planos de zonas del cuerpo señaladas",
  // Rendimiento.
  "estética de banco de imágenes, sonrisas de catálogo, gente en bata blanca posando con los brazos cruzados",
  "collages, marcos, bordes decorativos, texto ilegible, logotipos inventados, marcas de agua",
].join("; ");

/**
 * La regla que sustituye a «hazlo impactante».
 *
 * Es la traducción útil de lo que se busca: parar el scroll sin parecer un
 * anuncio. Va en todos los prompts, porque es la instrucción que más cambia el
 * resultado.
 */
export const STOPPING_POWER =
  "Tiene que parar el scroll **sin parecer un anuncio**: la foto que haría alguien con su móvil, no una campaña. Luz de la habitación, no de estudio. Encuadre imperfecto. Un objeto cotidiano visto demasiado de cerca o desde un ángulo raro para al ojo mucho mejor que una escena dramática, y además pasa la revisión de Meta.";

/* ------------------------------- El prompt ---------------------------------- */

export interface BeatExtractionInput {
  productName: string;
  audience: string;
  /** El cuerpo del copy: de aquí salen las escenas. */
  body: string;
  headline: string;
  /** El mecanismo del problema, si el ángulo lo declara. */
  problemMechanism?: string;
  /** Cuántas escenas se piden. */
  count: number;
  /** Cuánto se permite que incomoden. */
  intensity: Intensity;
}

/**
 * Pide al modelo que saque las escenas del texto, no que se las invente.
 *
 * La instrucción clave es `quote`: cada escena tiene que venir con la frase
 * literal del copy de la que sale. Es lo que impide que el modelo escriba siete
 * escenas genéricas de suplemento —que es lo que hace si le dejas— y lo que
 * permite comprobar de un vistazo si de verdad leyó la historia.
 */
export function buildBeatExtractionPrompt(input: BeatExtractionInput): string {
  const kinds = BEAT_KINDS.map(
    (kind) => `- **${kind}** (${BEAT_META[kind].label}): ${BEAT_META[kind].looksFor}`,
  ).join("\n");

  return `Eres director de arte de respuesta directa. Vas a sacar las imágenes de un anuncio **de dentro de su propia historia**.

## El anuncio

Producto: ${input.productName}
Público: ${input.audience}
Titular: "${input.headline}"
${input.problemMechanism ? `Mecanismo del problema: ${input.problemMechanism}\n` : ""}
Cuerpo del anuncio:
"""
${input.body}
"""

## Lo que tienes que hacer

Saca ${input.count} escenas **que estén en ese texto**. No inventes escenas genéricas de suplemento: recorre la historia y extrae sus momentos.

Cada escena tiene que traer la **frase literal del copy** de la que sale. Si no puedes citar una frase, esa escena no vale y eliges otra.

Tipos de escena disponibles:

${kinds}

No hace falta usar todos, ni en orden, ni uno de cada. Usa los que la historia tenga de verdad.

## Cómo se para el scroll

${STOPPING_POWER}

## Intensidad: ${INTENSITY_META[input.intensity].label}

${INTENSITY_META[input.intensity].direction}

## Lo que no puede aparecer

${FORBIDDEN}

Esto no es una preferencia estética. Las dos primeras categorías las rechaza Meta automáticamente, y una creatividad rechazada tiene un hook rate de cero. Las otras hacen que la imagen parezca un anuncio, que es exactamente lo que hay que evitar.

Si la historia habla de una condición médica, lo que puede verse es el **mecanismo explicado con serenidad** —una ilustración anatómica correcta, un análisis, una consulta normal— y la **vida cotidiana** alrededor. Nunca el cuerpo dañado.

## Formato

Para cada escena: el tipo, la frase literal citada, la escena en una línea, y la composición en detalle —encuadre, luz, qué objetos hay y dónde—. La composición se le va a pasar tal cual a un generador de imágenes, así que tiene que poder leerse sin más contexto.`;
}

/**
 * El prompt final de una escena, ya listo para el generador.
 *
 * Se compone aquí y no en el modelo para que las reglas —lo prohibido, el
 * formato, la referencia del producto— sean **las mismas en todas las
 * creatividades**. Dejar que el modelo las repita en cada escena garantiza que
 * en la quinta se le olvide alguna.
 */
export function buildBeatImagePrompt(options: {
  beat: StoryBeat;
  productName: string;
  audience: string;
  /** Si el producto tiene que salir en esta escena. */
  withProduct: boolean;
  intensity: Intensity;
}): string {
  const { beat, productName, audience, withProduct, intensity } = options;
  const meta = BEAT_META[beat.kind];

  return [
    beat.composition,
    "",
    `Escena: ${beat.scene}`,
    `Público: ${audience}.`,
    withProduct
      ? `${productName} aparece en la escena, reconocible pero sin protagonizar el encuadre: como estaría de verdad, encima de la mesa o en la mano.`
      : "El producto NO aparece en esta imagen.",
    "",
    STOPPING_POWER,
    "",
    INTENSITY_META[intensity].direction,
    "",
    `Formato ${meta.aspectRatio} para Meta.`,
    `No debe aparecer: ${FORBIDDEN}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Comprueba que la escena de verdad salió del texto.
 *
 * El modelo puede citar una frase que no está —lo hace cuando no encuentra
 * material y prefiere rellenar—. Comparar la cita contra el cuerpo del copy
 * detecta justo eso, y es barato.
 *
 * Se normalizan espacios y mayúsculas porque el modelo reescribe el espaciado al
 * copiar, pero no se hace nada más flexible: una coincidencia aproximada
 * aceptaría precisamente lo que se quiere detectar.
 */
export function quoteIsReal(quote: string, body: string): boolean {
  const clean = (text: string) =>
    text
      .toLowerCase()
      .replace(/[\s ]+/g, " ")
      // Las comillas tipográficas y los guiones largos cambian al copiar.
      .replace(/[«»""'']/g, '"')
      .replace(/[—–]/g, "-")
      .trim();

  const needle = clean(quote);
  // Una cita de tres palabras coincidiría con cualquier cosa por azar.
  if (needle.length < 15) return false;

  return clean(body).includes(needle);
}
