/**
 * Leer duraciones y créditos de lo que contesta el CLI de Higgsfield.
 *
 * Sin imports, probado en `higgsfield-params.test.ts`.
 *
 * ## Por qué se busca en toda la respuesta y no en una ruta fija
 *
 * Por lo mismo que `declaredMediaParams`: la forma del JSON del CLI no está
 * documentada y ya ha cambiado de sitio los parámetros al menos una vez. Una
 * ruta fija como `params.duration.options` deja de encontrar nada el día que se
 * mueve, y no falla — devuelve vacío, que es indistinguible de «este modelo no
 * tiene duración». El modelo pasaría a generar con su duración por defecto sin
 * que nadie lo note.
 *
 * Buscar por nombre de clave en todo el árbol sobrevive a la mudanza.
 */

/** Cómo se puede llamar el parámetro de duración. */
const DURATION_KEYS = new Set(["duration", "duration_seconds", "seconds", "length"]);

/** Lo más largo que tiene sentido para un plano de anuncio. */
const MAX_SECONDS = 60;

/**
 * Qué duraciones acepta un modelo, en segundos y ordenadas.
 *
 * Vacío significa **no se sabe**, no «no tiene»: quien llama tiene que
 * enseñarlo como un campo libre y no como un desplegable de una sola opción.
 */
export function declaredDurations(payload: unknown): number[] {
  const found = new Set<number>();
  const seen = new Set<unknown>();

  const add = (value: unknown): void => {
    const seconds = typeof value === "number" ? value : Number(value);

    /*
     * Se descartan los que no pueden ser segundos de vídeo.
     *
     * Un `duration` puede traer milisegundos, un identificador o un cero, y
     * cualquiera de los tres pintaría una opción absurda en el desplegable que
     * alguien acabaría eligiendo.
     */
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) return;

    found.add(seconds);
  };

  const walk = (node: unknown, underDuration: boolean): void => {
    if (node === null || typeof node !== "object") {
      if (underDuration) add(node);
      return;
    }

    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, underDuration);
      return;
    }

    /*
     * Un parámetro puede nombrarse de dos maneras, y hay que reconocer las dos.
     *
     * Como clave —`{duration: {options: [5, 10]}}`— o como entrada de una lista
     * que lleva su nombre dentro —`{name: "duration", enum: [5, 10]}`—. El CLI
     * usa la segunda en `model get`, y una versión que solo entendiera la
     * primera devolvería «este modelo no tiene duración» para todos.
     */
    const namesItself = ["name", "id", "param", "key"].some((field) => {
      const value = (node as Record<string, unknown>)[field];
      return typeof value === "string" && DURATION_KEYS.has(value);
    });

    for (const [key, value] of Object.entries(node)) {
      const isDuration = underDuration || namesItself || DURATION_KEYS.has(key);

      /*
       * Dentro de un parámetro de duración, `name` y `title` son su nombre, no
       * un valor. Sin esta salvedad, un `{name: "duration"}` se intentaría leer
       * como número — no molesta porque no lo es, pero un `{title: "5"}` sí.
       */
      if (isDuration && (key === "name" || key === "title" || key === "label")) continue;

      walk(value, isDuration);
    }
  };

  walk(payload, false);

  return [...found].sort((a, b) => a - b);
}

/**
 * Cuántos créditos cuesta, según `generate cost`.
 *
 * `credits_exact` manda sobre `credits` cuando está: el segundo viene
 * redondeado para enseñarlo y el primero es el que se cobra.
 *
 * `null` es «no lo dijo». Devolver cero sería decir que es gratis.
 */
export function creditsFrom(payload: unknown): number | null {
  if (payload === null || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  for (const key of ["credits_exact", "credits"]) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  // Puede venir envuelto en `data` o `result`, como el resto de sus respuestas.
  for (const key of ["data", "result", "cost", "estimate"]) {
    if (record[key] && typeof record[key] === "object") {
      const inner = creditsFrom(record[key]);
      if (inner !== null) return inner;
    }
  }

  return null;
}

/**
 * Lo que cuestan esos créditos en dólares.
 *
 * `null` cuando no hay tarifa configurada, y **eso se enseña tal cual**. El
 * precio del crédito depende del plan contratado, así que no hay un número
 * correcto que poner por defecto: inventarlo daría un coste con dos decimales
 * que parece medido y no lo está. Se configura en la pantalla de Configuración.
 */
export function creditsToUsd(credits: number | null, usdPerCredit: number | null): number | null {
  if (credits === null || usdPerCredit === null) return null;
  if (!Number.isFinite(credits) || !Number.isFinite(usdPerCredit)) return null;
  if (usdPerCredit <= 0) return null;

  return Math.round(credits * usdPerCredit * 10_000) / 10_000;
}

/** Cómo contarlo en una línea, diciendo lo que no se sabe. */
export function costLabel(credits: number | null, usd: number | null): string {
  if (credits === null) return "Higgsfield no dio el coste de esta generación.";

  const amount = `${credits} crédito${credits === 1 ? "" : "s"}`;

  return usd === null
    ? `${amount}. Pon el precio del crédito en Configuración para verlo en dólares.`
    : `${amount} · unos ${usd.toFixed(2)} USD`;
}
