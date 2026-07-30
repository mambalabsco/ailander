/**
 * Contar palabras, y decidir si un copy salió corto.
 *
 * Sin imports, probado en `word-count.test.ts`.
 *
 * ## Por qué existe
 *
 * **El modelo informaba de su propia longitud y se le creía.** El esquema pedía
 * un campo `wordCount` y ese número se guardaba tal cual, así que una pieza de
 * cuatrocientas palabras podía declarar mil doscientas y nadie se enteraba. El
 * síntoma que se ve es «salen copys cortos»; la causa es que nada lo medía.
 *
 * Contar aquí, en el servidor, tiene una segunda ventaja: convierte «salió
 * corto» en un dato accionable —cuántas palabras faltan— y con eso se puede
 * pedir una ampliación en vez de tirar la generación entera.
 */

/**
 * Palabras de un texto en español.
 *
 * Las reglas están elegidas para que el número coincida con lo que cuenta un
 * procesador de textos, que es la referencia con la que alguien va a comprobarlo:
 *
 * - Los guiones largos de diálogo y las rayas no son palabras.
 * - «TSH 6,8» son dos palabras, no tres: la coma decimal no separa.
 * - Los guiones de unión —«anti-inflamatorio»— no parten la palabra.
 * - Los saltos de línea y los espacios múltiples cuentan como un separador.
 */
export function countWords(text: string): number {
  if (!text) return 0;

  return (
    text
      // Las rayas de diálogo y los guiones largos van pegados a la palabra, así
      // que hay que separarlos antes de partir por espacios.
      .replace(/[—–]/g, " ")
      /*
       * El separador decimal se protege **antes** de barrer la puntuación.
       *
       * Sin esto, quitar las comas parte «TSH 6,8» en «6» y «8» y la cuenta
       * sale inflada — justo en los textos con datos, que son los que más
       * importa medir bien. Se sustituye por un guion bajo, que no está en la
       * lista de puntuación y no separa: el token sigue siendo uno solo.
       */
      .replace(/(\d)[.,](\d)/g, "$1_$2")
      // Los signos de puntuación no crean palabras nuevas.
      .replace(/[.,;:!?¡¿()[\]{}"«»""'']/g, " ")
      .split(/\s+/)
      // Un token que no tenga ni una letra ni un dígito no es una palabra: es
      // un asterisco de una lista, o un guion suelto de un separador.
      .filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  );
}

export type LengthVerdict = "corto" | "ok" | "largo";

export interface LengthCheck {
  words: number;
  verdict: LengthVerdict;
  /** Cuántas palabras faltan para llegar al mínimo. Cero si no falta ninguna. */
  missing: number;
  /** Frase para el resumen del trabajo. */
  message: string;
}

/**
 * Si la pieza cabe en el rango que pide su marco de escritura.
 *
 * El margen por abajo es del 10% y por arriba no hay margen duro: pasarse de
 * palabras en un long copy no es un defecto —de hecho suele convertir mejor— y
 * quedarse corto sí, porque el formato depende de tener sitio para construir la
 * tensión. Por eso «largo» es informativo y «corto» es lo que dispara la
 * ampliación.
 */
export function checkLength(text: string, range: [number, number]): LengthCheck {
  const words = countWords(text);
  const [min, max] = range;

  // Un 10% por debajo del mínimo sigue siendo aceptable: exigir el número
  // exacto haría que casi toda generación pidiera una segunda vuelta.
  const floor = Math.floor(min * 0.9);

  if (words < floor) {
    return {
      words,
      verdict: "corto",
      missing: min - words,
      message: `${words} palabras, se pidieron entre ${min} y ${max}`,
    };
  }

  if (words > max * 1.25) {
    return {
      words,
      verdict: "largo",
      missing: 0,
      message: `${words} palabras, por encima del rango de ${min}-${max}`,
    };
  }

  return { words, verdict: "ok", missing: 0, message: `${words} palabras` };
}

/**
 * La instrucción de longitud, para poner **al principio** del prompt.
 *
 * Estaba al final y en una línea, después de una sección larga sobre lo que no
 * hay que arrastrar del original. Ahí se cumple mal: la longitud es una
 * restricción global de la pieza y tiene que estar antes de que el modelo empiece
 * a planificarla, no como una nota al pie.
 *
 * Se traduce a párrafos además de palabras porque es la unidad con la que se
 * escribe. «Entre 1.200 y 1.400 palabras» es abstracto; «unos 20 párrafos de
 * cuatro o cinco líneas» se puede seguir mientras se redacta.
 */
export function lengthBrief(range: [number, number]): string {
  const [min, max] = range;
  // Unos 65 palabras por párrafo en un long copy de respuesta directa.
  const paragraphs = Math.round(((min + max) / 2) / 65);

  return `**Longitud: entre ${min} y ${max} palabras.** Son del orden de ${paragraphs} párrafos cortos. No es un objetivo aproximado: por debajo de ${min} la pieza no tiene sitio para construir la tensión y no sirve. Si al terminar te has quedado corto, sigue desarrollando —más escena, más objeción respondida, más prueba— antes de cerrar.`;
}

/**
 * Petición de ampliación, cuando la pieza salió corta.
 *
 * Se pide **continuar y desarrollar**, no reescribir. Reescribir devuelve otra
 * pieza igual de corta —el modelo repite su propio criterio de longitud— mientras
 * que decirle dónde añadir produce la ampliación de verdad.
 */
export function expansionPrompt(options: {
  current: string;
  words: number;
  range: [number, number];
}): string {
  const { current, words, range } = options;
  const [min, max] = range;

  return `Este texto se quedó en ${words} palabras y tiene que estar entre ${min} y ${max}.

"""
${current}
"""

Devuélvelo completo y ampliado, no un fragmento nuevo. **Conserva lo que ya está escrito** —el orden, las frases que funcionan, el titular— y desarrolla lo que falta:

- Alarga las escenas concretas en vez de resumirlas. Donde dice qué pasó, cuenta cómo.
- Responde una objeción más, de las que la investigación ya identifica.
- Añade la prueba que se quedó fuera.
- Desarrolla el mecanismo: por qué funciona, no solo que funciona.

Lo que **no** debes hacer para llegar al número: repetir ideas con otras palabras, añadir adjetivos, ni alargar el cierre. Un copy inflado convierte peor que uno corto.`;
}
