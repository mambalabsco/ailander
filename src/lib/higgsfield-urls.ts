/**
 * Lectura de la salida del CLI de Higgsfield.
 *
 * Vive aparte del cliente porque son funciones puras y hay que poder probarlas
 * sin arrancar el servidor. El cliente lleva `server-only`, que impide
 * importarlo desde cualquier otro sitio — incluida una prueba.
 */

/**
 * Los parámetros con los que puede viajar una imagen, y su bandera en el CLI.
 *
 * Cada modelo admite unos y no otros, igual que pasa en kie: el que hace vídeo
 * a partir de un primer fotograma quiere `start_image`, y el que mantiene un
 * personaje entre planos quiere `image_references`. Mandar la bandera
 * equivocada aborta la generación con «Unknown params».
 */
export const MEDIA_PARAMS: Record<string, string> = {
  image_references: "--image-references",
  start_image: "--start-image",
  end_image: "--end-image",
  video_references: "--video-references",
};

/** El parámetro con el que viaja la foto del producto en los de imagen. */
const REFERENCE_PARAM = "image_references";

/**
 * Los parámetros de imagen que declara un modelo.
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
export function declaredMediaParams(payload: unknown): string[] {
  const found = new Set<string>();
  const seen = new Set<unknown>();

  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      if (node in MEDIA_PARAMS) found.add(node);
      return;
    }

    if (node === null || typeof node !== "object") return;

    // Los ciclos son posibles si algún día la respuesta trae referencias
    // cruzadas; sin esto la búsqueda no terminaría.
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key in MEDIA_PARAMS) found.add(key);
      walk(value);
    }
  };

  walk(payload);

  return [...found];
}

/** Si un modelo declara aceptar imágenes de referencia. */
export function declaresImageReferences(payload: unknown): boolean {
  return declaredMediaParams(payload).includes(REFERENCE_PARAM);
}

const EXTENSIONS = {
  imagen: "png|jpe?g|webp|avif",
  video: "mp4|webm|mov|m4v",
} as const;

export type MediaKind = keyof typeof EXTENSIONS;

/**
 * Saca las URLs del resultado.
 *
 * El JSON del CLI no tiene una forma estable entre versiones, así que en vez de
 * atarse a una ruta concreta se recorre el objeto buscando URLs. Es menos
 * elegante y sobrevive a que reorganicen la respuesta, que es lo que importa
 * cuando el contrato no está documentado.
 *
 * Se filtra por extensión y por eso hay que decir qué se espera: un modelo de
 * vídeo devuelve el vídeo **y** su miniatura, y quedarse con la primera URL que
 * aparezca guardaría el `.jpg` de la miniatura como si fuera el clip.
 */
export function extractMediaUrls(stdout: string, kind: MediaKind = "imagen"): string[] {
  const urls = new Set<string>();

  const inline = new RegExp(`https?://\\S+\\.(?:${EXTENSIONS[kind]})(?:\\?\\S*)?`, "i");
  const exact = new RegExp(`^https?://\\S+\\.(?:${EXTENSIONS[kind]})(?:\\?\\S*)?$`, "i");

  const visit = (node: unknown) => {
    if (typeof node === "string") {
      if (exact.test(node)) urls.add(node);
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
      const match = trimmed.match(inline);
      if (match) urls.add(match[0]);
    }
  }

  return [...urls];
}

export function extractImageUrls(stdout: string): string[] {
  return extractMediaUrls(stdout, "imagen");
}

/* ---------------------------- El listado de modelos ------------------------ */

/** Las claves con las que un modelo puede traer su identificador. */
const SLUG_KEYS = ["job_type", "slug", "name", "id", "model", "type"];

/**
 * Encuentra la lista de modelos dentro de la respuesta del CLI.
 *
 * ## Por qué se busca en vez de leer una clave
 *
 * El CLI ha cambiado la forma de esta respuesta entre versiones —un array
 * suelto, `{items}`, `{data}`— y basta con que la próxima sea `{models}` para
 * que el listado llegue vacío. Vacío se lee como «no hay modelos de vídeo», que
 * es una conclusión falsa sobre un catálogo de cuarenta.
 *
 * Así que se recorre la respuesta buscando el primer array cuyos elementos
 * parezcan modelos: objetos con alguna de las claves que sirven de
 * identificador. Es menos elegante que leer `payload.items` y sobrevive a que
 * lo reorganicen, que es lo que importa cuando el contrato no está documentado.
 */
export function findModelList(payload: unknown): Record<string, unknown>[] | null {
  const looksLikeModel = (item: unknown): boolean =>
    typeof item === "object" &&
    item !== null &&
    !Array.isArray(item) &&
    SLUG_KEYS.some((key) => typeof (item as Record<string, unknown>)[key] === "string");

  const seen = new Set<unknown>();

  const walk = (node: unknown): Record<string, unknown>[] | null => {
    if (Array.isArray(node)) {
      if (node.length > 0 && node.every(looksLikeModel)) {
        return node as Record<string, unknown>[];
      }

      for (const child of node) {
        const found = walk(child);
        if (found) return found;
      }

      return null;
    }

    if (typeof node !== "object" || node === null) return null;
    if (seen.has(node)) return null;
    seen.add(node);

    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = walk(value);
      if (found) return found;
    }

    return null;
  };

  return walk(payload);
}

/**
 * Cómo describir lo que llegó, cuando no se encontró ninguna lista.
 *
 * Sin esto el mensaje es «no devolvió ningún modelo» y ahí se acaba la
 * investigación: no se sabe si el CLI contestó otra cosa, si la lista está en
 * una clave nueva o si de verdad está vacía. Con las claves delante, la
 * siguiente versión se arregla en un minuto.
 */
export function describePayload(payload: unknown): string {
  if (Array.isArray(payload)) return `un array de ${payload.length} elemento(s)`;

  if (typeof payload === "object" && payload !== null) {
    const keys = Object.keys(payload as Record<string, unknown>);
    return keys.length > 0 ? `un objeto con ${keys.slice(0, 8).join(", ")}` : "un objeto vacío";
  }

  return `un ${typeof payload}`;
}
