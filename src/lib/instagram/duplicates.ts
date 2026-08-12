/**
 * Que no salga dos veces el mismo gancho con otras palabras.
 *
 * ## Por qué no basta con metérselo en el encargo
 *
 * `recentSummary` ya le manda lo publicado con un «no repetir». Funciona las
 * primeras veces y deja de funcionar sobre la décima: el modelo encuentra la
 * forma que le sale bien y vuelve a ella. Metido en el encargo es una petición;
 * aquí es una comprobación, y una comprobación no se cansa.
 *
 * ## Por qué trigramas y no comparar palabras
 *
 * Porque lo que se repite no son las palabras exactas sino la forma: «el
 * zumbido no se va» y «el zumbido no se va nunca» comparten casi todo el hilo
 * de letras aunque tengan distinto número de palabras. Contando palabras
 * sueltas, «duermes mal» y «mal duermes» darían idénticos, que no lo son.
 */

/** Minúsculas, sin signos y sin espacios de sobra. Lo demás se conserva. */
export function normalizeHook(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    // Los diacríticos fuera: «sueño» y «sueno» no deberían ser dos ganchos.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const trigrams = (text: string): Set<string> => {
  const out = new Set<string>();
  // El relleno de los extremos hace que el principio y el final cuenten: dos
  // ganchos que empiezan igual se parecen más que dos que coinciden en medio.
  const padded = `  ${text}  `;

  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));

  return out;
};

/** Cuánto se parecen, de 0 a 1. Jaccard sobre trigramas. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const uno = trigrams(a);
  const otro = trigrams(b);

  let comunes = 0;
  for (const gram of uno) if (otro.has(gram)) comunes += 1;

  const total = uno.size + otro.size - comunes;

  return total === 0 ? 0 : comunes / total;
}

/**
 * Si este gancho ya se dijo.
 *
 * El umbral de 0.6 está puesto para el primer despliegue y se ajusta con las
 * piezas que ya hay en la base, no a ojo: por debajo deja pasar variaciones de
 * la misma frase, por encima descarta piezas distintas que comparten tema.
 */
export function isRepeat(hook: string, previous: string[], threshold = 0.6): boolean {
  const limpio = normalizeHook(hook);

  if (!limpio) return false;

  return previous.some((one) => similarity(limpio, normalizeHook(one)) >= threshold);
}
