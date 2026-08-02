/**
 * Guion de vídeo: tomas, cortes y duraciones.
 *
 * Sin imports, como los otros motores puros, y probado en `shots.test.ts`.
 *
 * Aquí vive el conocimiento del pipeline que ya funciona en producción —el
 * documento `MANUAL_PIPELINE_CLAUDE.md` y sus dos hermanos— traducido a código.
 * Casi cada regla de este archivo se aprendió rompiendo algo, y el comentario
 * dice qué.
 *
 * ## La idea que ordena todo: la voz manda
 *
 * El flujo viejo era generar vídeo mudo, estimar los tiempos y congelar
 * fotogramas a ojo para cuadrar. El que funciona es al revés: **la voz grabada
 * es la fuente de verdad del tiempo**. Cada toma dura exactamente lo que dura su
 * frase narrada, así que la sincronía sale sola y no hay nada que estimar.
 *
 * Por eso los cortes no se escriben a mano: se derivan de los tiempos por
 * palabra que devuelve el generador de voz.
 */

/* --------------------------------- Tomas ---------------------------------- */

/**
 * El papel visual de una toma.
 *
 * No es decorativo: cada uno arrastra su propia frase de render, y mezclarlos
 * sin criterio es lo que hace que un vídeo parezca cuatro vídeos pegados.
 */
export const SHOT_ROLES = ["story", "science", "emotion", "concept", "producto"] as const;

export type ShotRole = (typeof SHOT_ROLES)[number];

export interface RoleMeta {
  label: string;
  /** Qué se ve en una toma de este tipo. */
  description: string;
  /** El estilo de render que se le añade al prompt del keyframe. */
  style: string;
  /** Si admite pase de lipsync: hace falta una cara con proporciones humanas. */
  canLipsync: boolean;
}

export const ROLE_META: Record<ShotRole, RoleMeta> = {
  story: {
    label: "Historia",
    description: "Personaje, testimonio o experto. Es quien sostiene el relato.",
    style: "Pixar-style 3D animation, warm cinematic lighting, shallow depth of field",
    canLipsync: true,
  },
  science: {
    label: "Mecanismo",
    description: "Anatomía, moléculas, el proceso del que habla el guion.",
    style: "hyperreal medical 3D render, scientific CGI, clean studio lighting",
    canLipsync: false,
  },
  emotion: {
    label: "Emoción",
    description: "El miedo, la lucha, la metáfora. Lo que agita antes de resolver.",
    style: "dark cinematic, dramatic side lighting, moody, desaturated",
    canLipsync: false,
  },
  concept: {
    label: "Concepto",
    description: "Ingredientes, cápsulas genéricas, el producto sin marca.",
    style: "clean product photography lighting, soft gradient background",
    canLipsync: false,
  },
  producto: {
    label: "Producto real",
    description:
      "El envase de verdad. Cierra siempre el anuncio y **nunca** se inventa: va con su foto como referencia.",
    style: "photorealistic product shot, sharp label, studio softbox lighting",
    canLipsync: false,
  },
};

export interface Shot {
  /** «01», «02»… Cadena y no número para que ordene bien en nombres de archivo. */
  n: string;
  /**
   * Lo que se narra, escrito **fonético**: siglas deletreadas, números en
   * palabras. Es lo que se le manda al generador de voz.
   */
  guion: string;
  /**
   * Cómo se escribe en pantalla, cuando difiere del fonético.
   *
   * El guion dice «eme ce te» para que la voz lo pronuncie; el subtítulo tiene
   * que decir «MCT». Sin este campo los subtítulos salen escritos como se
   * pronuncian, que es el fallo que más delata un vídeo generado.
   */
  sub?: string;
  role: ShotRole;
  /** Qué se ve. Se convierte en el prompt del keyframe. */
  scene: string;
  /** Qué se mueve. Se convierte en el prompt de animación. */
  motion: string;
  /** Si en esta toma hay alguien hablando de frente a cámara. */
  speaking: boolean;
}

/* ------------------------------ Los cortes -------------------------------- */

/** Una palabra con su tiempo, tal y como los devuelve el generador de voz. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface Cut {
  n: string;
  start: number;
  end: number;
  guion: string;
}

export function cutDuration(cut: Cut): number {
  return Math.max(0, cut.end - cut.start);
}

/** Normaliza para comparar palabras: el generador devuelve puntuación pegada. */
function normalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/[.,;:!?¡¿()"«»""''—–]/g, "")
    .trim();
}

/**
 * Deriva los cortes reales de cada toma a partir de los tiempos por palabra.
 *
 * **Esto es lo que sustituye a estimar los tiempos a ojo.** Se recorre la lista
 * de palabras del audio en orden y se van consumiendo las de cada toma; el corte
 * empieza donde empieza su primera palabra y acaba donde acaba la última.
 *
 * Se avanza sin volver atrás a propósito. Buscar cada frase por todo el audio
 * encontraría la repetición equivocada en cuanto el guion repita una palabra
 * —y en un anuncio la marca se repite siempre—, y el vídeo se descuadraría a
 * mitad sin que nada avisara.
 *
 * Una toma cuyas palabras no aparezcan se devuelve en `missing` en vez de
 * inventarle un tiempo: un corte inventado produce un vídeo desincronizado, que
 * es peor que uno que falta y se ve.
 */
export function deriveCuts(
  shots: Shot[],
  words: TimedWord[],
): { cuts: Cut[]; missing: string[] } {
  const cuts: Cut[] = [];
  const missing: string[] = [];

  let cursor = 0;

  for (const shot of shots) {
    const wanted = shot.guion.split(/\s+/).map(normalize).filter(Boolean);
    if (wanted.length === 0) {
      missing.push(shot.n);
      continue;
    }

    // Se busca la primera palabra desde donde íbamos, no desde el principio.
    let start = -1;
    for (let index = cursor; index < words.length; index += 1) {
      if (normalize(words[index].word) === wanted[0]) {
        start = index;
        break;
      }
    }

    if (start === -1) {
      missing.push(shot.n);
      continue;
    }

    /*
     * El final se busca por la última palabra, no contando las de en medio.
     *
     * El generador de voz junta o parte tokens —«veinticinco» puede venir en dos
     * piezas— así que contar palabras desde el inicio se desalinea. Buscar la
     * última hacia delante es robusto ante eso.
     */
    const last = wanted[wanted.length - 1];
    let end = start;
    for (let index = start; index < words.length; index += 1) {
      if (normalize(words[index].word) === last) {
        end = index;
        // No se corta en la primera coincidencia: si la última palabra se repite
        // dentro de la propia frase, la buena es la de más adelante.
        if (index >= start + wanted.length - 1) break;
      }
    }

    cuts.push({
      n: shot.n,
      start: words[start].start,
      end: words[end].end,
      guion: shot.guion,
    });

    cursor = end + 1;
  }

  return { cuts, missing };
}

/* ------------------------- La duración que se pide ------------------------- */

export type ClipDuration = 5 | 10;

export interface DurationPlan {
  n: string;
  /** Lo que dura la voz de esa toma. */
  voice: number;
  /** Los segundos que se le piden al generador de vídeo. */
  request: ClipDuration;
  /** Cuánto hay que congelar el último fotograma, si hace falta. */
  freeze: number;
  /** Si la toma es tan larga que hay que partirla en dos planos. */
  split: boolean;
  reason: string;
}

/**
 * Cuántos segundos pedirle al generador por cada toma.
 *
 * La regla no es «redondea hacia arriba», y ahí está el ahorro. El generador
 * entrega unos 4,8–4,9 s reales cuando se le piden 5, así que una toma de 5,2 s
 * se cubre pidiendo 5 y congelando tres décimas del último fotograma: no se nota
 * porque es el último instante antes del corte.
 *
 * El umbral está en 5,5 y no en 5,0 justo por eso. Estirar más de medio segundo
 * sí se ve; ahí se pagan los 10. En un anuncio de catorce tomas con cinco «casi
 * cinco segundos», la diferencia entre aplicar esta regla y no aplicarla son unos
 * 2,50 dólares tirados.
 */
export function planDurations(cuts: Cut[], deliveredAt5 = 4.85): DurationPlan[] {
  return cuts.map((cut) => {
    const voice = cutDuration(cut);

    if (voice > 10) {
      return {
        n: cut.n,
        voice,
        request: 10,
        freeze: 0,
        split: true,
        reason: `${voice.toFixed(1)} s de voz: pasa de diez. Pártela en dos planos distintos.`,
      };
    }

    if (voice > 5.5) {
      return {
        n: cut.n,
        voice,
        request: 10,
        freeze: 0,
        split: false,
        reason: `${voice.toFixed(1)} s: por encima de 5,5, hace falta el clip de diez.`,
      };
    }

    const freeze = Math.max(0, voice - deliveredAt5);

    return {
      n: cut.n,
      voice,
      request: 5,
      freeze: Number(freeze.toFixed(2)),
      split: false,
      reason:
        freeze > 0
          ? `${voice.toFixed(1)} s: con el clip de cinco y ${freeze.toFixed(2)} s de congelado al final. Imperceptible.`
          : `${voice.toFixed(1)} s: cabe en el clip de cinco.`,
    };
  });
}

/* -------------------------------- Lipsync ---------------------------------- */

/**
 * Qué tomas van al pase de lipsync.
 *
 * Solo las que tienen a alguien hablando **de frente y con cara de proporciones
 * humanas**. Es una restricción del modelo, no una preferencia: con una forma
 * abstracta —un cubo con gafas, una gota con ojos— la llamada falla con
 * `face_detection_error` y se pierde el tiempo y el crédito.
 *
 * Las tomas de b-roll —anatomía, producto, manos, paisaje— no se lipsyncan
 * nunca: llevan la voz encima y los subtítulos ponen la palabra.
 *
 * El tope de diez segundos también es del modelo. Una toma más larga hay que
 * partirla por un límite de palabra, y para eso están los tiempos por palabra.
 */
export function lipsyncTargets(
  shots: Shot[],
  cuts: Cut[],
): { n: string; seconds: number }[] {
  const byShot = new Map(cuts.map((cut) => [cut.n, cut]));

  return shots
    .filter((shot) => shot.speaking && ROLE_META[shot.role].canLipsync)
    .map((shot) => ({ n: shot.n, seconds: cutDuration(byShot.get(shot.n) ?? { start: 0, end: 0, n: "", guion: "" }) }))
    .filter((target) => target.seconds > 0 && target.seconds <= 10);
}

/* -------------------------------- Prompts ---------------------------------- */

/**
 * Lo que nunca debe salir en la animación.
 *
 * Los primeros seis atacan el defecto característico del i2v: objetos que flotan
 * y giran en el vacío como un salvapantallas. Los últimos son los defectos de
 * generación que estropean una toma entera.
 */
export const NEGATIVE_PROMPT = [
  "floating in void",
  "spinning",
  "orbiting",
  "weightless",
  "screensaver",
  "empty background",
  "static posing at camera",
  "deformed hands",
  "deformed face",
  "extra fingers",
  "text",
  "watermark",
  "logo",
  "blurry",
  "talking mouth closeup",
].join(", ");

export interface StyleAnchor {
  /** La misma frase de render en **todos** los keyframes del vídeo. */
  render: string;
  /** El color de la marca, presente en todas las tomas. */
  accent: string;
}

/**
 * El prompt de un keyframe.
 *
 * El ancla de estilo va en todas las tomas y esa repetición es justo el punto:
 * es lo único que hace que catorce imágenes generadas por separado parezcan del
 * mismo vídeo. Sin ella cada toma sale con su propia luz y su propia paleta.
 */
export function keyframePrompt(
  shot: Shot,
  anchor: StyleAnchor,
  product?: { name: string; hasReference: boolean },
): string {
  const parts = [
    shot.scene,
    ROLE_META[shot.role].style,
    anchor.render,
    `color accent: ${anchor.accent}`,
    "vertical 9:16 composition",
  ];

  /*
   * En la toma de producto, el envase **es** el de la referencia.
   *
   * Sin decirlo, el modelo se inventa un frasco entero —forma, tapa y etiqueta
   * con el nombre bien escrito— y queda convincente. Ese es el problema: no se
   * ve que está mal hasta que alguien compara con el bote de verdad, y para
   * entonces el vídeo ya está montado y pagado.
   *
   * Y en un suplemento el envase es el producto. Un anuncio que enseña un frasco
   * que no es el que llega es una devolución.
   */
  if (shot.role === "producto" && product?.hasReference) {
    parts.push(
      `the product is EXACTLY the one in the attached reference image: same bottle shape, same cap, same label, same colours, same text`,
      `do not redesign the packaging, do not rewrite the label, do not invent any text`,
    );
  }

  /*
   * Sin foto de referencia, mejor sin etiqueta que con una inventada.
   *
   * Una etiqueta inventada se lee como real; un frasco liso se ve claramente
   * como pendiente de sustituir, y eso es lo que se quiere que se note.
   */
  if (shot.role === "producto" && product && !product.hasReference) {
    parts.push("plain unbranded bottle, no label, no text of any kind");
  }

  return parts.filter(Boolean).join(". ");
}

/**
 * El prompt de animación.
 *
 * Los tres bloques son obligatorios y cada uno tapa un fallo distinto. El
 * **anclaje físico** —una mesa, el suelo, una mano— evita que el sujeto flote.
 * La **acción con propósito** evita el «se mueve un poco» que no cuenta nada. Y
 * la **cámara concreta y lenta** evita el zoom nervioso; se pide empujar o
 * panear despacio, nunca orbitar, que es lo que delata el vídeo generado.
 */
export function motionPrompt(shot: Shot): string {
  return [shot.motion, "camera moves slowly and deliberately", "grounded in the scene"].join(
    ". ",
  );
}

/* --------------------------------- Coste ----------------------------------- */

export interface Rates {
  /** Por carácter de voz. */
  voicePerChar: number;
  keyframe: number;
  /** Por segundo de vídeo generado. */
  videoPerSecond: number;
  /** Por pase de lipsync de hasta cinco segundos. */
  lipsync: number;
}

/**
 * Tarifas por defecto, las medidas en producción con el proveedor económico.
 *
 * Están aquí y no en el código de red para que el presupuesto se pueda calcular
 * y probar sin llamar a nadie. Se pueden sobreescribir al cambiar de proveedor.
 */
export const DEFAULT_RATES: Rates = {
  voicePerChar: 0.00003,
  keyframe: 0.02,
  videoPerSecond: 0.07,
  lipsync: 0.014,
};

/**
 * El salto de precio que hay que conocer antes de elegir cuántas tomas.
 *
 * El generador solo vende clips de cinco o de diez segundos. Una toma con 5,4
 * segundos de voz cabe en uno de cinco; una con 5,6 **paga uno de diez**. Diez
 * céntimos de voz de más cuestan el doble de clip.
 *
 * Eso convierte «más tomas» en «más caro» de una forma que no se ve venir:
 *
 * - 6 tomas de 10 s → 60 s pagados, 4,20 USD
 * - 10 tomas de 6 s → **100 s pagados, 7,00 USD**  ← todas se pasan por medio segundo
 * - 11 tomas de 5,5 s → 55 s pagados, 3,85 USD
 *
 * Once tomas cuestan **la mitad** que diez, y dan un corte más. Por eso esto se
 * calcula y se enseña en vez de dejarlo a la intuición, que aquí falla siempre.
 */
export const CLIP_THRESHOLD = 5.5;

export interface ShotCountOption {
  shots: number;
  /** Segundos de voz que le tocan a cada toma. */
  perShot: number;
  /** Segundos de vídeo que se pagan. */
  billed: number;
  /** Cuánto se desperdicia frente a la voz que hay que cubrir. */
  waste: number;
}

/** Lo que costaría repartir esos segundos en ese número de tomas. */
export function shotCountOption(seconds: number, shots: number): ShotCountOption {
  const perShot = seconds / Math.max(1, shots);
  const billed = shots * (perShot > CLIP_THRESHOLD ? 10 : 5);

  return {
    shots,
    perShot: Number(perShot.toFixed(2)),
    billed,
    waste: Number(Math.max(0, billed - seconds).toFixed(2)),
  };
}

/**
 * Los repartos que no tiran dinero, de menos tomas a más.
 *
 * Son los dos sitios donde el precio por segundo de voz toca suelo: justo por
 * debajo del umbral —clips de cinco, muchos cortes— y con la toma llena de diez.
 * En medio siempre se paga de más.
 */
export function efficientShotCounts(seconds: number, max = 14): ShotCountOption[] {
  const options: ShotCountOption[] = [];

  for (let shots = 2; shots <= max; shots += 1) {
    const option = shotCountOption(seconds, shots);
    const perClip = option.perShot > CLIP_THRESHOLD ? 10 : 5;

    // Se queda con las que aprovechan el clip: la voz llena al menos el 90 % de
    // lo que se paga. El resto es el tramo caro.
    if (option.perShot >= perClip * 0.9) options.push(option);
  }

  return options;
}

export interface Budget {
  voice: number;
  keyframes: number;
  video: number;
  lipsync: number;
  total: number;
  /** Segundos de vídeo que se van a generar, que es de donde sale casi todo. */
  videoSeconds: number;
}

/**
 * Lo que va a costar el vídeo, antes de gastar nada.
 *
 * Se enseña siempre y antes de lanzar. Es la regla de control de gasto del
 * pipeline: nada de pago se dispara sin que alguien haya visto la tabla, porque
 * un lote se cobra entero de golpe y un error de un cero se descubre después.
 */
export function estimate(options: {
  shots: Shot[];
  plans: DurationPlan[];
  lipsyncCount: number;
  rates?: Rates;
}): Budget {
  const rates = options.rates ?? DEFAULT_RATES;

  const characters = options.shots.reduce((sum, shot) => sum + shot.guion.length, 0);
  const videoSeconds = options.plans.reduce((sum, plan) => sum + plan.request, 0);

  const voice = characters * rates.voicePerChar;
  const keyframes = options.shots.length * rates.keyframe;
  const video = videoSeconds * rates.videoPerSecond;
  const lipsync = options.lipsyncCount * rates.lipsync;

  return {
    voice,
    keyframes,
    video,
    lipsync,
    videoSeconds,
    total: voice + keyframes + video + lipsync,
  };
}

/* ------------------------------ Comprobaciones ----------------------------- */

/**
 * Los nombres de las letras en español.
 *
 * Hacen falta escritos porque una sigla deletreada no son letras sueltas sino
 * sus **nombres**: «eme ce te», no «m c t». Buscar caracteres sueltos —que fue
 * el primer intento— no encuentra ninguna.
 */
const LETTER_NAMES = new Set([
  "a", "be", "ce", "de", "e", "efe", "ge", "hache", "i", "jota", "ka", "ele",
  "eme", "ene", "eñe", "o", "pe", "cu", "erre", "ere", "ese", "te", "u", "uve",
  "equis", "ye", "zeta", "ceta", "i griega",
]);

/**
 * Si el texto parece llevar una sigla deletreada.
 *
 * Tres nombres de letra seguidos. Con dos habría demasiados falsos positivos
 * —«de te», «a ese»— porque varios nombres de letra son también palabras
 * corrientes en español. Tres seguidas ya casi solo pasa deletreando.
 */
function looksSpelledOut(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[.,;:!?¡¿()"«»""'']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let run = 0;
  for (const word of words) {
    run = LETTER_NAMES.has(word) ? run + 1 : 0;
    if (run >= 3) return true;
  }

  return false;
}


export interface ShotProblem {
  n: string;
  problem: string;
}

/**
 * Lo que hay que arreglar antes de gastar.
 *
 * Cada comprobación corresponde a un fallo que ya ocurrió y costó dinero, no a
 * una buena práctica genérica. Se ejecutan sobre el guion, que es cuando
 * arreglarlas es gratis.
 */
export function reviewShots(shots: Shot[]): ShotProblem[] {
  const problems: ShotProblem[] = [];
  const seen = new Set<string>();

  for (const shot of shots) {
    if (seen.has(shot.n)) problems.push({ n: shot.n, problem: "El número de toma está repetido." });
    seen.add(shot.n);

    if (!shot.guion.trim()) {
      problems.push({ n: shot.n, problem: "No tiene texto narrado." });
    }

    if (!shot.scene.trim()) {
      problems.push({ n: shot.n, problem: "No dice qué se ve, así que no hay keyframe que generar." });
    }

    if (!shot.motion.trim()) {
      problems.push({
        n: shot.n,
        problem: "No dice qué se mueve. Sin acción concreta, la animación sale flotando en el vacío.",
      });
    }

    /*
     * Siglas y cifras sin su forma de pantalla.
     *
     * El guion se escribe fonético para que la voz lo pronuncie bien, y si esa
     * toma no trae `sub`, el subtítulo saldrá escrito «eme ce te». Es el detalle
     * que más delata un vídeo hecho con IA.
     */
    if (!shot.sub && looksSpelledOut(shot.guion)) {
      problems.push({
        n: shot.n,
        problem:
          "Parece llevar una sigla deletreada y no tiene texto de pantalla. Añádelo o el subtítulo saldrá escrito tal cual se pronuncia.",
      });
    }

    if (shot.speaking && !ROLE_META[shot.role].canLipsync) {
      problems.push({
        n: shot.n,
        problem: `Está marcada como hablada pero es una toma de ${ROLE_META[shot.role].label.toLowerCase()}. El lipsync necesita una cara con proporciones humanas: fallaría. Déjala con la voz encima.`,
      });
    }
  }

  /*
   * El anuncio cierra con el producto real.
   *
   * Es la regla que más veces se saltó y la que más caro sale: sin ella el
   * vídeo termina sin enseñar qué se vende. Y el envase nunca se inventa —va su
   * foto como referencia— porque un packaging generado se nota y quema la marca.
   */
  if (shots.length > 0 && shots[shots.length - 1].role !== "producto") {
    problems.push({
      n: shots[shots.length - 1].n,
      problem:
        "El vídeo no cierra con el producto real. La última toma debería ser el envase de verdad, con su foto como referencia.",
    });
  }

  return problems;
}
