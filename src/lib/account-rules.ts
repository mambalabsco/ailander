/**
 * Lo que hay que comprobar antes de tocar la cuenta de alguien.
 *
 * Sin imports y sin base de datos, para poder probarlo entero. Devuelven el
 * motivo en español o `null` cuando no hay problema — así quien llama escribe
 * `const problema = passwordProblem(x); if (problema) return …` y no se le
 * olvida ninguna rama.
 */

/**
 * El mínimo son 8 y no es un número elegido aquí: es el que declara
 * `minimum_password_length` en `supabase/config.toml`. Si allí sube y aquí no,
 * el aviso se da tarde —lo daría Supabase, con su mensaje en inglés.
 */
export const MINIMO_CONTRASENA = 8;

export function passwordProblem(value: string): string | null {
  const limpia = value.trim();

  if (!limpia) return "Escribe la contraseña nueva.";

  if (limpia.length < MINIMO_CONTRASENA) {
    return `La contraseña necesita ${MINIMO_CONTRASENA} caracteres o más.`;
  }

  return null;
}

/**
 * El correo propuesto, contra el que ya tiene.
 *
 * No valida el formato a fondo a propósito: la comprobación que de verdad
 * importa la hace el buzón al recibir el enlace. Aquí solo se para lo que es
 * seguro que no va a llegar a ningún sitio.
 */
export function emailProblem(value: string, actual: string): string | null {
  const nuevo = value.trim().toLowerCase();

  if (!nuevo) return "Escribe el correo nuevo.";
  if (!nuevo.includes("@") || nuevo.startsWith("@") || nuevo.endsWith("@")) {
    return "Ese correo no parece un correo.";
  }

  /*
   * En minúsculas los dos antes de comparar: Supabase guarda el correo así, y
   * sin normalizar «Pedro@…» parecería un cambio, se propondría, y al confirmar
   * no cambiaría nada — un camino entero para acabar donde se estaba.
   */
  if (nuevo === actual.trim().toLowerCase()) return "Es el correo que ya tiene.";

  return null;
}
