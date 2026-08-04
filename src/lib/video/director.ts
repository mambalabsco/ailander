/**
 * Dirigir un anuncio entero de una sola pieza.
 *
 * Sin imports, probado en `director.test.ts`.
 *
 * ## Qué problema resuelve
 *
 * Un generador que acepta veinte mil caracteres —Seedance— no necesita que le
 * mandes una frase: necesita que le mandes **la dirección**. Mandarle solo el
 * guion es desaprovecharlo, porque el guion dice lo que se oye y no lo que se
 * ve: sin estructura, el modelo reparte las frases como quiere, mete cortes
 * donde no toca y el envase cambia de forma entre plano y plano.
 *
 * Aquí se compone ese encargo largo: la estructura del anuncio, el guion
 * literal, cómo se rueda y qué no puede pasar. Es la diferencia entre pedir un
 * vídeo y pedir **este** vídeo.
 *
 * ## Sin relleno
 *
 * Nada de «cinematic masterpiece, 8k, ultra detailed, award winning». Esas
 * palabras no describen nada: no dicen qué encuadre, qué luz ni qué pasa, y en
 * un encargo largo compiten por atención con las líneas que sí mandan. En los
 * modelos de vídeo actuales empeoran el resultado más de lo que lo mejoran —
 * empujan hacia un look de banco de imágenes.
 *
 * Se quitan **al final**, sobre el texto ya compuesto, porque también aparecen
 * en lo que escribe el modelo de guion y en lo que teclea la persona.
 *
 * ## La estructura es una plantilla, el guion no
 *
 * Las plantillas dicen en qué partes se divide el anuncio y qué hace cada una.
 * El guion entra **literal**: es lo que se ha escrito y aprobado, y reescribirlo
 * aquí sería cambiar el anuncio sin decirlo.
 */

export interface DirectorTemplate {
  id: string;
  label: string;
  note: string;
  /** Las partes del anuncio, en orden. Es la estructura, no el texto. */
  beats: { title: string; ask: string }[];
}

/**
 * Las formas de anuncio que se pueden pedir enteras.
 *
 * Son las que funcionan en respuesta directa de suplementos: cada una es una
 * manera distinta de ordenar lo mismo, y cuál gana depende del producto. Por eso
 * es un selector y no una sola.
 */
export const DIRECTOR_TEMPLATES: DirectorTemplate[] = [
  {
    id: "ugc",
    label: "Testimonio a cámara",
    note: "Una persona hablando al móvil. Es lo que menos parece anuncio.",
    beats: [
      {
        title: "Gancho",
        ask: "La persona ya está hablando cuando empieza el plano. Sin saludo, sin presentarse. Cámara en mano, a la altura de los ojos, en su casa.",
      },
      {
        title: "El problema",
        ask: "Cuenta lo que le pasaba con sus palabras, mirando a cámara. Un solo plano, sin cortes.",
      },
      {
        title: "El descubrimiento",
        ask: "Enseña el envase sosteniéndolo con la mano, a media distancia. La etiqueta se lee.",
      },
      {
        title: "El cambio",
        ask: "Cómo está ahora. Luz distinta a la del principio: el mismo sitio otro día.",
      },
      {
        title: "Qué hacer",
        ask: "Cierra mirando a cámara, con el envase todavía en el plano.",
      },
    ],
  },
  {
    id: "problema-solucion",
    label: "Problema y solución",
    note: "Empieza por lo que duele y acaba en el envase. Clásico y directo.",
    beats: [
      {
        title: "La escena del problema",
        ask: "El momento concreto en el que molesta, sin nadie hablando. Se entiende solo con la imagen.",
      },
      {
        title: "Por qué pasa",
        ask: "Una imagen que explique la causa. Nada de esquemas médicos con texto.",
      },
      {
        title: "El producto",
        ask: "El envase entra en plano, en una mesa o en una mano. Luz natural lateral.",
      },
      {
        title: "El después",
        ask: "La misma persona del primer plano, haciendo lo que antes le costaba.",
      },
      { title: "Cierre", ask: "El envase solo, centrado, quieto." },
    ],
  },
  {
    id: "demo",
    label: "Producto en uso",
    note: "Todo el peso en el envase y en el gesto de tomarlo.",
    beats: [
      { title: "Apertura", ask: "El envase entrando en cuadro, sobre una superficie limpia." },
      { title: "El gesto", ask: "Una mano lo abre y saca la dosis. Plano corto, cámara quieta." },
      { title: "El momento del día", ask: "Dónde encaja: desayuno, gimnasio, antes de dormir." },
      { title: "El resultado", ask: "Una escena de la vida normal, sin producto en el plano." },
      { title: "Cierre", ask: "El envase otra vez, en el mismo sitio del principio." },
    ],
  },
];

export function findDirectorTemplate(id: string): DirectorTemplate | null {
  return DIRECTOR_TEMPLATES.find((template) => template.id === id) ?? null;
}

/* --------------------------------- Relleno --------------------------------- */

/**
 * Las palabras que no aportan nada.
 *
 * Se quitan enteras, con su coma si la llevan. No es una lista de estilo: es
 * literalmente vocabulario que no describe ni encuadre, ni luz, ni acción, y que
 * en los generadores actuales tira hacia el banco de imágenes.
 */
export const FILLER = [
  "cinematic masterpiece",
  "masterpiece",
  "award winning",
  "award-winning",
  "trending on artstation",
  "ultra detailed",
  "ultra-detailed",
  "highly detailed",
  "extremely detailed",
  "best quality",
  "high quality",
  "hyperrealistic",
  "hyper realistic",
  "photorealistic",
  "8k",
  "4k uhd",
  "unreal engine",
  "octane render",
  "professional photography",
  "stunning",
  "breathtaking",
  "epic",
];

/**
 * Quita el relleno sin tocar lo demás.
 *
 * Solo palabra entera: `epic` fuera, pero `epicentro` intacto. Y después se
 * limpian las comas y los espacios que quedan sueltos, porque una coma doble en
 * mitad de una frase la parte al leerla.
 */
export function stripFiller(text: string): string {
  let out = text;

  for (const word of FILLER) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
  }

  return out
    .replace(/[ \t]{2,}/g, " ")
    // Comas seguidas: donde había tres palabras de relleno quedan tres comas.
    .replace(/,(\s*,)+/g, ",")
    .replace(/[ \t]+([.,;])/g, "$1")
    .replace(/^[ \t]*[,;]\s*/gm, "")
    .replace(/[ \t,;]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------- El encargo -------------------------------- */

export interface DirectorBrief {
  /** El texto que se manda al generador. */
  prompt: string;
  /** Si se recortó por el tope del proveedor, cuántos caracteres se perdieron. */
  trimmed: number;
}

/** El tope de Seedance. Pasarse no avisa: rechaza la petición entera. */
export const MAX_PROMPT = 20_000;

/**
 * Compone la dirección completa.
 *
 * Sin plantilla devuelve el guion tal cual —limpio de relleno— porque esa es la
 * opción de «yo ya sé lo que quiero» y añadirle secciones sería discutirle el
 * encargo a quien lo escribió.
 */
export function directorBrief(options: {
  /** El guion aprobado, literal. */
  script: string;
  templateId?: string;
  productName?: string;
  seconds?: number;
  aspectRatio?: string;
  language?: string;
  /** Cuántas imágenes van de referencia, para decir qué es cada una. */
  references?: number;
  /**
   * Lo que sitúa este vídeo dentro de un anuncio más largo.
   *
   * Va aparte del guion porque no es guion: dice qué tramo es, que ya se contó
   * lo anterior y si le toca cerrar o no. Sin esto, cada tramo cuenta la
   * historia entera y salen cuatro anuncios seguidos que dicen lo mismo.
   */
  continuity?: string;
}): DirectorBrief {
  const script = options.script.trim();
  const template = findDirectorTemplate(options.templateId ?? "");

  if (!template) {
    /*
     * Sin plantilla va el guion tal cual — pero la continuidad sí entra.
     *
     * No es estilo: es dónde encaja este vídeo. Callarla porque no hay plantilla
     * haría que el tramo tres del anuncio se creyera el anuncio entero.
     */
    const prompt = stripFiller([options.continuity?.trim(), script].filter(Boolean).join("\n\n"));

    return { prompt: prompt.slice(0, MAX_PROMPT), trimmed: Math.max(0, prompt.length - MAX_PROMPT) };
  }

  const lines: string[] = [
    `Vídeo de ${options.seconds && options.seconds > 0 ? Math.round(options.seconds) : 15} segundos`,
    `Formato ${options.aspectRatio || "9:16"}. Voz en ${options.language || "español"}.`,
  ];

  // Antes que nada: si esto es un tramo de algo más largo, cambia todo lo demás.
  if (options.continuity?.trim()) lines.push("", options.continuity.trim());

  lines.push("", "## Estructura", "");

  for (const [index, beat] of template.beats.entries()) {
    lines.push(`${index + 1}. **${beat.title}** — ${beat.ask}`);
  }

  lines.push(
    "",
    "## Guion",
    "",
    "Esto es lo que se dice, literal y en este orden. No lo reescribas, no lo",
    "resumas y no le añadas frases.",
    "",
    script,
  );

  if (options.references && options.references > 0) {
    /*
     * Qué es cada referencia, y sobre todo la primera.
     *
     * Sin decirlo, el modelo trata las imágenes como inspiración de estilo y se
     * dibuja su propio envase — el fallo que ya costó una tanda entera de
     * fotogramas con botes inventados.
     */
    lines.push(
      "",
      "## Las imágenes que te mando",
      "",
      "La primera es el envase real del producto. Cópialo exactamente: forma,",
      "color, tipografía y etiqueta. No lo rediseñes ni le cambies el nombre.",
      options.references > 1
        ? "Las demás son la persona y el sitio. Mantén la misma cara en todo el anuncio."
        : "",
    );
  }

  lines.push(
    "",
    "## Cómo se rueda",
    "",
    "- Un movimiento de cámara por plano, despacio. Nada de zooms rápidos.",
    "- Luz natural, con dirección clara. La misma temperatura en todo el anuncio.",
    "- La cara de la persona no cambia entre planos.",
    "",
    "## Lo que no puede pasar",
    "",
    "- Texto en pantalla, subtítulos, marcas de agua ni logotipos. Los generadores",
    "  escriben letras deformes y hay que tirar la toma.",
    "- Un envase distinto al de la referencia, o con otro nombre.",
    "- Batas blancas, sellos médicos ni gráficas: parece publicidad sanitaria.",
  );

  if (options.productName?.trim()) {
    lines.push("", `El producto se llama ${options.productName.trim()}.`);
  }

  const prompt = stripFiller(lines.filter((line) => line !== undefined).join("\n"));

  return {
    prompt: prompt.slice(0, MAX_PROMPT),
    trimmed: Math.max(0, prompt.length - MAX_PROMPT),
  };
}
