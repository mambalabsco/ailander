/**
 * Traerse una landing de otra marca por su enlace.
 *
 * Sin imports, probado en `landing-import.test.ts`.
 *
 * ## Qué se guarda y qué no
 *
 * El **texto** y la estructura, no el código. El CSS de una página está atado al
 * armazón de su tema —sus variables, sus clases, su retícula— y pegarlo en otro
 * sitio da un diseño roto, no uno idéntico. Lo que sirve de una landing ajena es
 * en qué orden cuenta las cosas y con qué palabras, y eso es texto.
 *
 * ## Por qué hay que juzgar lo que llega
 *
 * Una petición a una página moderna devuelve casi siempre un 200 con muy poco
 * dentro: el contenido lo pinta el navegador después. Guardar eso como
 * referencia es guardar un cascarón —«Cargando…», el menú y el pie— y después
 * generar una landing a partir de nada, sin que nada avise.
 *
 * Por eso se mide lo que se sacó y se dice. Con doscientas palabras hay
 * referencia; con veinte, lo que hay es un cascarón.
 */

/** Por debajo de esto no hay página, hay armazón. */
export const MIN_WORDS = 120;

export interface Imported {
  title: string;
  text: string;
  words: number;
  /** Vacío si sirve; si no, por qué no. */
  problem: string;
  /** Lo que conviene saber aunque sirva. */
  note: string;
}

/**
 * Cuenta palabras de verdad, no trozos separados por espacios.
 *
 * Un menú de navegación son cincuenta palabras de una a tres letras; contarlas
 * igual que las de un párrafo haría pasar por buena una página vacía.
 */
function realWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length > 2).length;
}

/**
 * Decide si lo descargado vale como referencia.
 *
 * `title` sale del `<title>` y `text` del cuerpo ya sin etiquetas: los dos los
 * saca quien descarga, que es lo que toca la red. Aquí solo se juzga.
 */
export function judgeImport(input: { title: string; text: string; host: string }): Imported {
  const text = input.text.replace(/\s+/g, " ").trim();
  const words = realWords(text);

  const title = input.title.trim().slice(0, 120) || `Landing de ${input.host}`;

  if (words === 0) {
    return {
      title,
      text,
      words,
      problem: `De ${input.host} no salió nada de texto. Puede que bloquee las descargas o que la página se pinte entera desde el navegador; pega el texto a mano.`,
      note: "",
    };
  }

  if (words < MIN_WORDS) {
    return {
      title,
      text,
      words,
      problem: `De ${input.host} solo salieron ${words} palabras: eso es el menú y el pie, no la página. Casi seguro que el contenido lo pinta el navegador. Ábrela, selecciona todo y pégalo a mano.`,
      note: "",
    };
  }

  return {
    title,
    text,
    words,
    problem: "",
    /*
     * Una landing larga de verdad pasa de mil palabras. Entre ciento veinte y
     * mil puede ser una página corta legítima o media página descargada, y
     * quien la use tiene que poder mirarla antes de calcarla.
     */
    note:
      words < 600
        ? `Salieron ${words} palabras, que es poco para una landing larga: repásala antes de calcarla.`
        : "",
  };
}

/**
 * La dirección, normalizada, o vacío si no vale.
 *
 * Se acepta pegarla sin `https://`, que es como se copia de la barra a veces.
 * Y se rechaza todo lo que no sea web pública: esta descarga la hace el
 * **servidor**, y sin filtro se le podría pedir que se asome a la red interna
 * —donde llega él y no llega nadie más—.
 */
export function readPageUrl(raw: string): { url: string; problem: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: "", problem: "Pega el enlace de la página." };

  /*
   * El prefijo solo se pone cuando **no hay esquema**.
   *
   * Poniéndolo siempre que no empiece por `http`, un `ftp://algo` se convierte
   * en `https://ftp//algo`: una dirección que parsea, que no es la que se pegó,
   * y que se acepta cuando lo que tocaba era rechazarla.
   */
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return { url: "", problem: "Eso no parece una dirección web." };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { url: "", problem: "Solo se pueden traer páginas web." };
  }

  const host = parsed.hostname.toLowerCase();

  const internal =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":");

  if (internal) {
    return { url: "", problem: "Esa dirección no es una web pública." };
  }

  return { url: parsed.toString(), problem: "" };
}
