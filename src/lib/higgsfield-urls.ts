/**
 * Lectura de la salida del CLI de Higgsfield.
 *
 * Vive aparte del cliente porque son funciones puras y hay que poder probarlas
 * sin arrancar el servidor. El cliente lleva `server-only`, que impide
 * importarlo desde cualquier otro sitio — incluida una prueba.
 */

/** El parámetro con el que viaja la foto del producto. */
const REFERENCE_PARAM = "image_references";

/**
 * Si un modelo declara aceptar imágenes de referencia.
 *
 * **Se busca en lo que devuelve el CLI, no en una lista escrita a mano.** Una
 * lista de modelos «con referencia» se queda vieja en cuanto Higgsfield añade
 * uno, y el fallo sería silencioso: la generación saldría bien y con un envase
 * inventado. El propio CLI valida los parámetros contra los que el modelo
 * declara —rechaza los desconocidos—, así que la respuesta ya está ahí.
 *
 * Se recorre el JSON entero en vez de asumir dónde cuelgan los parámetros:
 * pueden venir como lista de nombres, como objeto indexado por nombre o
 * anidados, y las tres formas se han visto en APIs de este tipo.
 */
export function declaresImageReferences(payload: unknown): boolean {
  const seen = new Set<unknown>();

  const walk = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") {
      return node === REFERENCE_PARAM;
    }
    // Los ciclos son posibles si algún día la respuesta trae referencias
    // cruzadas; sin esto la búsqueda no terminaría.
    if (seen.has(node)) return false;
    seen.add(node);

    if (Array.isArray(node)) return node.some(walk);

    for (const [key, value] of Object.entries(node)) {
      if (key === REFERENCE_PARAM) return true;
      if (walk(value)) return true;
    }
    return false;
  };

  return walk(payload);
}

/**
 * Saca las URLs del resultado.
 *
 * El JSON del CLI no tiene una forma estable entre versiones, así que en vez de
 * atarse a una ruta concreta se recorre el objeto buscando URLs de imagen. Es
 * menos elegante y sobrevive a que reorganicen la respuesta, que es lo que
 * importa cuando el contrato no está documentado.
 */
export function extractImageUrls(stdout: string): string[] {
  const urls = new Set<string>();

  const visit = (node: unknown) => {
    if (typeof node === "string") {
      if (/^https?:\/\/\S+\.(png|jpe?g|webp|avif)(\?\S*)?$/i.test(node)) urls.add(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node as Record<string, unknown>).forEach(visit);
    }
  };

  // La salida puede traer varias líneas JSON, o texto mezclado con JSON.
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      visit(JSON.parse(trimmed));
    } catch {
      // No era JSON: puede ser la URL impresa en texto plano por `--wait`.
      const match = trimmed.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|avif)(?:\?\S*)?/i);
      if (match) urls.add(match[0]);
    }
  }

  return [...urls];
}
