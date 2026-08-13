/**
 * De dónde sale la página que se usa como modelo.
 *
 * Sin imports, probado en `reference-id.test.ts`.
 *
 * ## Por qué esto es una función y no un `startsWith` suelto
 *
 * Porque un prefijo mal leído **no da ningún error**: escribe una página entera
 * tomando como modelo la equivocada, se paga, y solo se nota leyéndola. Con tres
 * orígenes —el plano de una tienda analizada, una página del propio producto y
 * el archivo de copys— la condición deja de caber en la cabeza y empieza a
 * escribirse al revés.
 *
 * El prefijo lleva los dos puntos dentro a propósito: sin ellos, un id del
 * archivo que empiece por «landing» se tomaría por una página.
 */

export type Reference =
  | { kind: "ninguna" }
  /** El id completo, que es lo que espera `findModelPage`. */
  | { kind: "plano"; id: string }
  /** Una página del producto: propia, clonada o nacida de un copy. */
  | { kind: "landing"; id: string }
  /** Un copy o una página guardados en el archivo. */
  | { kind: "archivo"; id: string };

const PLANO = "plano:";
const LANDING = "landing:";

export function parseReferenceId(raw: string): Reference {
  const value = raw.trim();
  if (!value) return { kind: "ninguna" };

  // El plano se pasa entero: su id lleva dentro tienda y sección.
  if (value.startsWith(PLANO)) return { kind: "plano", id: value };

  if (value.startsWith(LANDING)) {
    const id = value.slice(LANDING.length).trim();
    // Un prefijo sin nada detrás es un desplegable a medio elegir, no una
    // página: buscarlo devolvería «esa referencia ya no existe», que despista.
    return id ? { kind: "landing", id } : { kind: "ninguna" };
  }

  return { kind: "archivo", id: value };
}

/** El identificador con el que se ofrece una página del producto. */
export function landingReferenceId(landingId: string): string {
  return `${LANDING}${landingId}`;
}
