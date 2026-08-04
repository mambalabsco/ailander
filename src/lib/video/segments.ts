/**
 * Un anuncio largo en un generador que solo hace piezas cortas.
 *
 * Sin imports, probado en `segments.test.ts`.
 *
 * ## El problema
 *
 * Seedance hace quince segundos por llamada. Un anuncio de cincuenta no cabe, y
 * las dos salidas obvias son malas:
 *
 * - Recortar a quince y meter dentro el guion de cincuenta. Es lo que pasaba, y
 *   sale el anuncio al triple de velocidad.
 * - Que la persona monte cuatro nodos y escriba una trama nueva en cada uno. Eso
 *   no es un anuncio de cincuenta segundos, son cuatro anuncios de quince
 *   pegados: cambia el sitio, cambia la ropa y cambia la cara entre uno y otro.
 *
 * ## Lo que se hace
 *
 * Se parte el anuncio en tramos que el generador sí acepta y se le pasa a cada
 * uno **el último fotograma del anterior**. La historia se reparte entre ellos
 * con su principio y su final, no se repite en cada uno.
 *
 * Es la diferencia entre cortar un anuncio y trocearlo.
 *
 * ## El fotograma es continuidad, no una cadena
 *
 * Sirve para que sea el mismo anuncio: el mismo producto, el mismo estilo, la
 * misma luz, y la misma persona **cuando vuelve a salir**. No para obligar a que
 * cada tramo siga el plano anterior.
 *
 * Un anuncio corta. Hay partes que son el envase solo, unas manos, un detalle,
 * otro sitio — y pedir que la persona esté en todos los planos porque estaba en
 * el primero da un anuncio en el que alguien mira a cámara durante cincuenta
 * segundos. Eso estaba en la primera versión de esto y era un error.
 */

export interface Segment {
  /** Su posición, empezando en 1. */
  index: number;
  total: number;
  seconds: number;
  /** En qué segundo del anuncio entero empieza y acaba. */
  from: number;
  to: number;
}

/**
 * Cómo se reparten los segundos.
 *
 * ## Por qué se reparte parejo y no «llenar y lo que sobre»
 *
 * Cincuenta segundos en piezas de quince son tres llenas y una de cinco. Esa
 * última es un plano suelto que no da tiempo a nada, y en un anuncio se nota:
 * parece que se cortó. Repartido parejo salen cuatro de doce y medio, que es un
 * plano normal cuatro veces.
 *
 * ## Y por qué se redondea hacia arriba
 *
 * Porque el reparto tiene que sumar **al menos** lo pedido. Redondeando hacia
 * abajo, cuatro tramos de doce dan cuarenta y ocho y el anuncio dura dos
 * segundos menos que lo que se encargó — y esos dos suelen ser el cierre.
 */
export function planSegments(options: {
  seconds: number;
  /** Lo máximo que el generador hace de una vez. */
  maxSeconds: number;
  minSeconds?: number;
  /** Las duraciones sueltas que vende, si no acepta cualquiera. */
  durations?: number[];
}): Segment[] {
  const total = Math.max(1, Math.round(options.seconds));
  const max = Math.max(1, Math.round(options.maxSeconds));
  const min = Math.max(1, Math.round(options.minSeconds ?? 1));

  const pieces = Math.max(1, Math.ceil(total / max));
  const each = Math.ceil(total / pieces);

  /*
   * Con lista cerrada se coge el valor que vende y que **no se queda corto**.
   *
   * Pedirle un 7 a un modelo que vende 5, 10 y 15 no redondea: rechaza la
   * petición. Y quedarse en 5 acorta el anuncio sin decirlo.
   */
  const fit = (want: number): number => {
    if (!options.durations || options.durations.length === 0) {
      return Math.min(max, Math.max(min, want));
    }

    const sorted = [...options.durations].sort((a, b) => a - b);
    return sorted.find((option) => option >= want) ?? sorted[sorted.length - 1];
  };

  const seconds = fit(each);
  const out: Segment[] = [];

  for (let index = 0; index < pieces; index += 1) {
    out.push({
      index: index + 1,
      total: pieces,
      seconds,
      from: index * seconds,
      to: (index + 1) * seconds,
    });
  }

  return out;
}

/** Lo que va a durar de verdad, que casi nunca es lo que se pidió. */
export function totalSeconds(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.seconds, 0);
}

/**
 * Lo que se le dice al generador en cada tramo.
 *
 * ## Lo que evita
 *
 * Sin esto, cada tramo recibe el guion entero y cada uno intenta contar la
 * historia completa: cuatro anuncios de quince segundos que dicen lo mismo, uno
 * detrás de otro. Con esto, cada tramo sabe **qué parte le toca**, que ya se
 * contó lo anterior y que después viene más — así que ni presenta lo presentado
 * ni cierra lo que no toca cerrar.
 *
 * El último es el único que cierra. Un anuncio que acaba tres veces se lee como
 * tres anuncios.
 */
export function segmentInstruction(segment: Segment): string {
  if (segment.total === 1) return "";

  const lines = [
    "## Qué parte de la historia es esta",
    "",
    `Este vídeo es el tramo ${segment.index} de ${segment.total} de un anuncio de`,
    `${segment.total * segment.seconds} segundos. Cubre del segundo ${segment.from} al ${segment.to}.`,
    "",
    "Cuenta **solo esa parte**. No resumas el anuncio entero ni intentes meter",
    "toda la historia dentro: lo que falta lo cuentan los otros tramos.",
  ];

  if (segment.index > 1) {
    lines.push(
      "",
      "Ya se ha visto lo anterior, así que no vuelvas a presentar a nadie ni a",
      "replantear el problema desde cero.",
      "",
      "La primera imagen que te mando es **el último fotograma del tramo",
      "anterior**. Está ahí para que el anuncio sea el mismo: el mismo producto,",
      "el mismo estilo de imagen, la misma luz y el mismo sitio cuando se vuelva a",
      "él; y si sale una persona que ya salía, que sea **la misma persona**.",
      "",
      "Lo que **no** es: una obligación de seguir ese plano. Esto es un anuncio y",
      "un anuncio corta. Si esta parte pide otro encuadre —el envase solo, unas",
      "manos, un detalle, otro sitio, otro momento del día—, córtalo y ya está. No",
      "metas a la persona en el plano solo porque estaba en el anterior: si lo que",
      "toca contar aquí no la necesita, no sale.",
    );
  }

  if (segment.index < segment.total) {
    lines.push(
      "",
      "Y no cierres el anuncio: después viene más. Nada de plano final del envase",
      "quieto, nada de llamada a la acción, nada de fundido a negro. Acaba con la",
      "escena todavía viva.",
    );
  } else {
    lines.push(
      "",
      "Este es el último tramo: aquí se cierra.",
      "",
      "Lo que se dice abajo es **el final del texto** y tiene que oírse entero,",
      "hasta la última frase. Si hay llamada a la acción, va aquí. Un anuncio que",
      "se corta antes de acabar la frase no sirve para nada, así que ajusta la",
      "imagen al texto y no al revés.",
    );
  }

  return lines.join("\n");
}

/**
 * Qué parte del guion le toca a cada tramo.
 *
 * Se reparte por **palabras y no por frases**: las frases de un guion son de
 * longitudes muy distintas y repartir cinco frases entre cuatro tramos deja uno
 * con la mitad del texto. Por palabras, cada tramo recibe aproximadamente lo que
 * cabe en sus segundos.
 *
 * Se corta por el espacio más cercano, nunca a media palabra.
 */
export function sliceScript(script: string, segment: Segment): string {
  if (segment.total === 1) return script;

  const words = script.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const per = Math.ceil(words.length / segment.total);
  const from = (segment.index - 1) * per;

  /*
   * El último se lleva todo lo que quede.
   *
   * Con el reparto justo, los redondeos dejan fuera las últimas palabras — y las
   * últimas palabras de un anuncio son el cierre.
   */
  const to = segment.index === segment.total ? words.length : Math.min(words.length, from + per);

  return words.slice(from, to).join(" ");
}
