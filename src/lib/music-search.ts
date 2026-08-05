import "server-only";

import {
  openverseQuery,
  readCatalogTrack,
  type Track,
} from "@/lib/video/music-library";

/**
 * Buscar música libre de derechos en catálogos abiertos.
 *
 * ## Qué hay detrás
 *
 * Openverse, que busca a la vez en Freesound, Jamendo y Wikimedia y filtra por
 * licencia en su servidor. No pide clave, así que no hay una credencial más que
 * mantener ni un servicio más que pueda quedarse sin cuota a mitad de un
 * anuncio.
 *
 * ## Lo que se comprueba y por qué
 *
 * Todo lo que decide si una pista es legal está en `music-library.ts`, que es
 * puro y está probado. Aquí solo se hace la llamada. La razón es que la parte
 * cara de equivocarse —dejar pasar una licencia `by-nc-nd`— no se puede probar
 * si vive pegada a un `fetch`.
 */

/** Un fallo de red no deja la pantalla en blanco: deja una lista vacía y un motivo. */
export interface SearchResult {
  tracks: Track[];
  problem: string;
}

export async function searchFreeMusic(options: {
  text: string;
  minSeconds?: number;
  allowAttribution?: boolean;
  page?: number;
}): Promise<SearchResult> {
  const url = openverseQuery(options);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      // Es un catálogo público: lo que devuelva hoy vale mañana, pero una
      // búsqueda repetida con otra duración tiene que volver a preguntar.
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return {
        tracks: [],
        problem: `El catálogo de música no contestó (${response.status}). Vuelve a intentarlo en un momento.`,
      };
    }

    const payload = (await response.json()) as { results?: unknown[] };

    const tracks = (payload.results ?? [])
      .map((item) => readCatalogTrack(item, options.minSeconds ?? 0))
      .filter((track): track is Track => track !== null);

    /*
     * Que no haya resultados y que se hayan caído todos no es lo mismo.
     *
     * Lo primero es que la búsqueda no encontró nada; lo segundo es que
     * encontró cosas que no se pueden usar en un anuncio. Decir «sin
     * resultados» en los dos casos haría probar otras palabras cuando el
     * problema era la duración o la licencia.
     */
    if (tracks.length === 0 && (payload.results ?? []).length > 0) {
      return {
        tracks: [],
        problem:
          "Hay resultados, pero ninguno sirve: o su licencia no permite anuncios, o no llegan a la duración que pediste. Prueba a bajar la duración o a aceptar las que piden citar al autor.",
      };
    }

    return { tracks, problem: "" };
  } catch (error) {
    return {
      tracks: [],
      problem:
        error instanceof Error && error.name === "TimeoutError"
          ? "El catálogo de música tardó demasiado."
          : "No se pudo conectar con el catálogo de música.",
    };
  }
}
