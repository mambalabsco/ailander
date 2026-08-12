/**
 * Lo que se arregla solo y lo que no.
 *
 * ## Por qué el código y no el mensaje
 *
 * Porque el mensaje de Meta cambia y se traduce, y una condición escrita contra
 * un texto deja de cumplirse el día que a Meta le da por reescribirlo — sin
 * avisar y sin dar error. El código no cambia: es lo que Meta promete que es
 * estable.
 *
 * El mensaje se sigue conservando porque es lo que hace útil el registro: dice
 * «la cuenta no es profesional» donde el código solo dice `10`.
 */

export class InstagramError extends Error {
  readonly code: number;
  readonly subcode: number;

  constructor(message: string, code: number, subcode = 0) {
    super(message);
    this.name = "InstagramError";
    this.code = code;
    this.subcode = subcode;
  }
}

/**
 * Códigos que no se arreglan esperando.
 *
 * - `190`: el token no vale. Hay que reautorizar.
 * - `200`, `10`: falta un permiso, o la cuenta no es profesional.
 * - `100` con subcódigo `33`: se pide un objeto que no existe o al que la app
 *   no llega — normalmente la cuenta de Instagram equivocada.
 */
const PERMANENTES = new Set([190, 200, 10]);

export function esPermanente(error: unknown): boolean {
  if (!(error instanceof InstagramError)) return false;

  if (error.code === 100 && error.subcode === 33) return true;

  return PERMANENTES.has(error.code);
}
