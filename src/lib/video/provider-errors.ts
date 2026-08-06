/**
 * Traducir lo que contesta un proveedor cuando algo falla.
 *
 * Sin imports, probado en `provider-errors.test.ts`.
 *
 * ## Por qué esto vive fuera de `providers.ts`
 *
 * Porque `providers.ts` lleva `server-only` y no se puede importar desde una
 * prueba. Y esto sí hay que probarlo: decide qué se le dice a alguien que acaba
 * de perder una generación, y de ahí depende si lo arregla en un minuto o si
 * pasa media hora mirando el código equivocado.
 *
 * ## El fallo que arregla
 *
 * `{"detail":"User is locked. Reason: TOP_UP."}` con un 403. Eso significa «te
 * has quedado sin saldo, recarga la cuenta», y tal cual parece un fallo de la
 * plataforma: lo primero que se hace al leerlo es volver a intentarlo —falla
 * igual— y después mirar el código, que está bien.
 *
 * Los casos que se distinguen son los que se arreglan de forma distinta: sin
 * saldo se recarga, con la clave mal se cambia en el entorno, y con el contenido
 * rechazado hay que cambiar el prompt. En ninguno de los tres sirve repetir, y
 * eso es justo lo que se hace cuando el mensaje no dice cuál es.
 */

export interface Problem {
  message: string;
  /** Si repetir lo mismo tiene alguna posibilidad de salir bien. */
  worthRetrying: boolean;
}

/**
 * Qué ha pasado, en algo que se pueda accionar.
 *
 * `what` es lo que se estaba haciendo —«el montaje», «la música con Cassette»—
 * y va dentro del mensaje: un error sin la tarea delante obliga a adivinar cuál
 * de las cinco cosas que estaban en marcha se cayó.
 */
export function explainProvider(what: string, status: number, detail: string): Problem {
  const text = detail.toLowerCase();

  /*
   * Sin saldo.
   *
   * Se mira el texto además del código porque un 403 también es una clave sin
   * permiso, y son cosas distintas: una se arregla pagando y la otra tocando el
   * entorno del servidor.
   */
  if (/top_up|is locked|insufficient|balance/.test(text)) {
    return {
      message: `Tu cuenta de fal se ha quedado sin saldo, así que ${what} no se puede hacer. Recarga en fal.ai/dashboard/billing y vuelve a lanzarlo: lo que ya estaba generado no se pierde.`,
      worthRetrying: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      message: `El proveedor rechazó la clave al hacer ${what}. Comprueba FAL_KEY en el entorno del servidor.`,
      worthRetrying: false,
    };
  }

  if (status === 422 || /content policy|moderation|nsfw|safety/.test(text)) {
    return {
      message: `El proveedor rechazó el contenido de ${what}: ${detail.slice(0, 200)}. Repetirlo igual dará lo mismo; cambia el prompt o el material.`,
      worthRetrying: false,
    };
  }

  /*
   * El cupo y los fallos suyos sí se reintentan.
   *
   * Son los dos casos en los que el mismo encargo puede salir bien un minuto
   * después, y es lo que la cola ya hace sola.
   */
  if (status === 429) {
    return {
      message: `El proveedor está al límite de peticiones y ${what} tendrá que esperar. Se reintenta solo.`,
      worthRetrying: true,
    };
  }

  if (status >= 500) {
    return {
      message: `El proveedor falló al hacer ${what} (${status}). Se reintenta solo.`,
      worthRetrying: true,
    };
  }

  return {
    message: `${what} respondió ${status}. ${detail.slice(0, 300)}`.trim(),
    worthRetrying: false,
  };
}
