/**
 * Lo cerca que hay que quedarse de la página de referencia.
 *
 * Sin imports, probado en `landing-fidelity.test.ts`.
 *
 * ## Por qué esto es un módulo y no dos frases dentro del prompt
 *
 * Porque calcar y inspirarse no se diferencian en una frase: se diferencian en
 * **qué reglas dejan de aplicarse**.
 *
 * El prompt de landing lleva las reglas de la casa —entre 1.100 y 1.500
 * palabras, alterna los tipos de sección, que aparezcan valoración, autor, dato,
 * mecanismo, comparativa, garantía y preguntas—. Escritas para escribir una
 * página nueva, están bien. Pero con una referencia delante **compiten** con
 * ella: se le pide calcar y a la vez se le impone la longitud, el reparto de
 * secciones y el surtido de la casa, así que el modelo obedece las reglas
 * concretas y sale otra vez la misma página de siempre con otro texto.
 *
 * Era exactamente lo que se veía: todas las landings con el mismo formato,
 * calcara lo que calcara.
 *
 * Así que en modo calcado esas reglas **no se mandan**. Manda la referencia.
 */

export type Fidelity = "calcado" | "inspirado" | "copia";

export function readFidelity(value: unknown): Fidelity {
  if (value === "inspirado") return "inspirado";
  if (value === "copia") return "copia";
  return "calcado";
}

/**
 * Qué hacer con la referencia.
 *
 * En calcado se reutiliza **el texto**, no solo la forma. Es lo que se pide al
 * traer una página que ya vende: su orden, su ritmo, sus frases y su longitud,
 * cambiando solo lo que es del otro producto. Reescribirla «con el mismo
 * espíritu» es escribir otra página, y entonces la referencia no servía de nada.
 */
export function referenceRules(fidelity: Fidelity): string {
  if (fidelity === "inspirado") {
    return [
      "**Úsala como patrón.** Quédate con lo que la hace funcionar —por dónde",
      "entra, cómo escala, dónde coloca la prueba y la objeción— y escribe una",
      "página nueva. No debe reconocerse el original.",
    ].join("\n");
  }

  return [
    "**Cálcala.** No la reescribas: reutiliza su texto.",
    "",
    "- Ve **frase por frase**, en su orden, y quédate con la misma frase salvo",
    "  que diga algo que no valga para este producto.",
    "- Conserva su estructura, su número de secciones, su ritmo y su longitud.",
    "  Si tiene once secciones, salen once. Si un párrafo tiene dos frases, sale",
    "  con dos.",
    "- Conserva también su **tono y su formato**: si va de artículo de revista,",
    "  sale de artículo; si va de carta personal, sale de carta. No lo conviertas",
    "  al formato de siempre.",
    "",
    "### Lo único que cambia",
    "",
    "- El nombre del producto, la marca y el sitio donde se compra.",
    "- Los ingredientes, el mecanismo y lo que el producto hace: los de este.",
    "- Las cifras, los estudios y los resultados: los que sostenga esta",
    "  investigación, o fuera.",
    "- Los nombres de personas, ciudades y medios: los del país de destino.",
    "- El precio y la oferta.",
    "",
    "Todo lo demás —los enganches, las transiciones, las objeciones, el orden en",
    "que aparecen, cómo cierra— se queda como está.",
    "",
    "### Si está en otro idioma",
    "",
    "Tradúcela al idioma de destino, no la resumas. Una traducción publicitaria:",
    "misma intención y mismo golpe frase a frase, con las expresiones del país,",
    "no una traducción literal que suena a manual.",
  ].join("\n");
}

/**
 * Las reglas de la casa, que solo valen cuando se escribe de cero.
 *
 * Devuelve vacío en modo calcado **a propósito**: ahí la longitud, el reparto de
 * secciones y el surtido los pone la referencia. Mandarlas también es pedirle
 * dos cosas incompatibles y quedarse con la que está escrita en números.
 */
export function houseRules(fidelity: Fidelity, hasReference: boolean): string {
  if (fidelity !== "inspirado" && hasReference) return "";

  return [
    "**Usa la variedad.** Una página de veinte párrafos seguidos se abandona.",
    "Alterna: un dato tras una sección densa, una comparativa antes de la oferta,",
    "el mecanismo numerado cuando expliques el porqué, las preguntas frecuentes",
    "antes del cierre. Como mínimo deben aparecer `valoracion`, `autor`, `dato`,",
    "`mecanismo`, `comparativa`, `garantia` y `faq`.",
    "",
    "### Reglas que vienen de páginas que funcionan",
    "",
    "1. **El producto no aparece en el primer tercio.** Primero el lector tiene",
    "   que reconocerse en el problema.",
    "2. Entre 1.100 y 1.500 palabras de cuerpo.",
    "3. Frases por debajo de 15 palabras, nivel de 5.º grado, párrafos de una a",
    "   tres frases.",
    "4. **Tres llamadas a la acción repartidas**: una a mitad, otra tras la",
    "   prueba social, otra al final. Con texto del tipo «Ver disponibilidad»,",
    "   nunca «Comprar ahora».",
  ].join("\n");
}

/**
 * Lo que nunca se arrastra, se calque o no.
 *
 * Va aparte porque es lo único que no admite excepción: una página adaptada que
 * promete lo que el producto no hace convierte una vez y devuelve el pedido — y
 * en suplementos, además, tumba la cuenta publicitaria.
 */
export const NEVER_CARRIED =
  "**Nada de lo que la referencia afirme sobre su producto se arrastra aquí**: " +
  "ni ingredientes, ni estudios, ni cifras de resultados, ni nombres de marca. " +
  "Solo se queda lo que esta investigación sostiene para este producto. Una " +
  "página adaptada que promete lo que el producto no hace convierte una vez y " +
  "devuelve el pedido.";

/**
 * Las imágenes de la referencia, cuando se calca.
 *
 * Se listan para que cada hueco de la página nueva ocupe **el mismo sitio** que
 * ocupaba una de ellas. Sin esto, el modelo coloca las imágenes donde le parece
 * y una página calcada acaba con la foto del producto donde el original tenía el
 * diagrama que explica el mecanismo.
 */
export function referenceImages(urls: string[]): string {
  if (urls.length === 0) return "";

  return [
    "### Las imágenes que llevaba",
    "",
    `Tenía ${urls.length}. Deja un hueco de imagen en el mismo punto donde iba`,
    "cada una y describe en su `prompt` **lo mismo que enseñaba**, con este",
    "producto y esta gente. Si una era un diagrama del mecanismo, el hueco lleva",
    "un diagrama del mecanismo de este producto — no una foto bonita.",
    "",
    ...urls.slice(0, 12).map((url, index) => `${index + 1}. ${url}`),
  ].join("\n");
}
