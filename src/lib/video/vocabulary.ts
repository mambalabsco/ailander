/**
 * Las palabras que el transcriptor escribiría mal.
 *
 * Sin imports, probado en `vocabulary.test.ts`.
 *
 * ## Por qué existe este archivo
 *
 * Los subtítulos los transcribe el servicio del vídeo ya montado, escuchando el
 * audio de verdad. Es la única forma de que cuadren: cualquier tiempo calculado
 * aquí es una **suposición** sobre dónde acabó cada palabra, y basta con que el
 * montaje mueva algo unas décimas para que se lea descuadrado.
 *
 * Pero transcribir tiene un precio: escribe lo que oye. El guion va fonético
 * para que la voz pronuncie bien —«eme ce te» donde va «MCT»— y eso es
 * exactamente lo que aparecería en pantalla.
 *
 * La solución no es mandarle el texto ya hecho, que es lo que descuadraba. El
 * servicio acepta un **vocabulario**: «cuando oigas esto, escribe aquello». Así
 * los tiempos los sigue midiendo él sobre el audio real, y la ortografía la
 * ponemos nosotros.
 */

/**
 * Una corrección: cómo se escribe y cómo suena.
 *
 * `replaces` **no puede ir vacío**: el servicio lo exige con al menos un
 * elemento y devuelve 422 si falta. Sin él la entrada tampoco serviría de nada
 * —la corrección se busca por lo que suena— así que una entrada sin
 * sustituciones se descarta en vez de mandarse.
 */
export interface VocabularyEntry {
  word: string;
  replaces: string[];
}

/** El servicio no acepta más de cien. */
export const MAX_ENTRIES = 100;

/** Ni más de veinte sustituciones por entrada, ni de cien letras cada una. */
const MAX_REPLACES = 20;
const MAX_LENGTH = 100;

/**
 * Recorta a una sola línea de texto plano.
 *
 * Los subtítulos van palabra a palabra, así que una entrada con una frase entera
 * no sirve de nada: nunca va a coincidir con lo que el transcriptor está
 * escuchando en ese instante.
 */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * El vocabulario de un vídeo, a partir de sus tomas y de la marca.
 *
 * De cada toma sale una entrada solo cuando lo escrito y lo hablado difieren:
 * si coinciden, el transcriptor ya lo va a escribir bien y una entrada de más
 * gasta sitio del tope.
 */
export function buildVocabulary(options: {
  shots: { guion: string; sub?: string }[];
}): VocabularyEntry[] {
  const entries = new Map<string, Set<string>>();

  const add = (word: string, sounds: string) => {
    const written = tidy(word).slice(0, MAX_LENGTH);
    const spoken = tidy(sounds).slice(0, MAX_LENGTH);

    if (!written || !spoken) return;
    // Lo que suena igual que como se escribe no corrige nada.
    if (spoken.toLowerCase() === written.toLowerCase()) return;

    const set = entries.get(written) ?? new Set<string>();
    set.add(spoken);
    entries.set(written, set);
  };

  for (const shot of options.shots) {
    const written = tidy(shot.sub ?? "");
    if (!written) continue;

    /*
     * Solo la parte que cambia, no la toma entera.
     *
     * El guion y el subtítulo de una toma se diferencian en una palabra —«MCT»
     * contra «eme ce te»— y el resto es idéntico. Mandar las dos frases enteras
     * le pide al transcriptor que case veinte palabras de golpe, y no lo hace;
     * mandar solo el trozo que difiere sí funciona.
     */
    const spokenWords = tidy(shot.guion).split(" ");
    const writtenWords = written.split(" ");

    let head = 0;
    while (
      head < spokenWords.length &&
      head < writtenWords.length &&
      spokenWords[head].toLowerCase() === writtenWords[head].toLowerCase()
    ) {
      head += 1;
    }

    let tail = 0;
    while (
      tail < spokenWords.length - head &&
      tail < writtenWords.length - head &&
      spokenWords[spokenWords.length - 1 - tail].toLowerCase() ===
        writtenWords[writtenWords.length - 1 - tail].toLowerCase()
    ) {
      tail += 1;
    }

    const spokenPart = spokenWords.slice(head, spokenWords.length - tail).join(" ");
    const writtenPart = writtenWords.slice(head, writtenWords.length - tail).join(" ");

    // Si difieren de cabo a rabo no hay trozo que aislar: va la frase entera.
    if (writtenPart) add(writtenPart, spokenPart);
    else add(written, tidy(shot.guion));
  }

  /*
   * Nada de nombres de marca «a secas».
   *
   * Tentaba añadir la marca y los ingredientes por si el transcriptor los
   * escribe mal, pero una entrada así no tiene con qué corregir: la corrección
   * se busca por **cómo suena**, y sin eso el servicio la rechaza entera con un
   * 422 —`replaces` es obligatorio y con un elemento como mínimo— dejando el
   * vídeo sin ningún subtítulo. Que es exactamente lo que pasó.
   *
   * Cuando el guion escribe una marca fonética, ya sale de su `sub`.
   */
  return [...entries]
    .map(([word, sounds]) => ({ word, replaces: [...sounds].slice(0, MAX_REPLACES) }))
    .slice(0, MAX_ENTRIES);
}

/* ------------------------------- El idioma --------------------------------- */

/**
 * El código de idioma que espera el transcriptor.
 *
 * Se le dice para que no lo adivine. Un anuncio corto con música encima le da
 * poco donde agarrarse, y confundir español con portugués o con italiano
 * produce un subtítulo entero de palabras parecidas y equivocadas.
 *
 * La variante regional importa menos que acertar el idioma, pero se aprovecha
 * la del mercado cuando se sabe: cambia cómo escribe el voseo y algún término.
 */
const MARKETS: Record<string, string> = {
  chile: "es-CL",
  cl: "es-CL",
  mexico: "es-MX",
  méxico: "es-MX",
  mx: "es-MX",
  colombia: "es-CO",
  co: "es-CO",
  argentina: "es-AR",
  ar: "es-AR",
  peru: "es-PE",
  perú: "es-PE",
  pe: "es-PE",
  españa: "es-ES",
  espana: "es-ES",
  es: "es-ES",
  usa: "es-US",
  us: "es-US",
};

export function subtitleLanguage(market?: string): string {
  const key = (market ?? "").trim().toLowerCase();

  // Sin mercado conocido, español neutro de España: acierta el idioma, que es
  // lo que de verdad cambia el resultado.
  return MARKETS[key] ?? "es-ES";
}
