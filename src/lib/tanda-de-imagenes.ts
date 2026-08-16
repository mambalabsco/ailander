/**
 * Qué imágenes faltan en un conjunto o en una campaña.
 *
 * El motor de generación ya aceptaba una tanda con `adId` **por creatividad**
 * (`image-generate-actions.ts`), así que generar toda una campaña es una sola
 * llamada. Lo que no había era forma de pedirla: cada anuncio montaba su propio
 * botón con un solo visual dentro, y había que abrirlos de uno en uno.
 *
 * Esto decide qué entra en la tanda, y vive aparte y puro para poder probarlo
 * sin base de datos. Nada de `server-only` ni de imports con alias: el corredor
 * de Node no resuelve `@/`.
 */

/** Lo que espera `generateAdVisualsAction` por cada creatividad. */
export interface VisualDeAnuncio {
  title: string;
  prompt: string;
  aspectRatio: string;
  concept: string;
  origin: string;
  adId: string;
}

export interface TandaDeImagenes {
  /** Anuncios sin ninguna imagen todavía. */
  faltan: VisualDeAnuncio[];
  /** Los que ya tienen al menos una. Solo se generan si se pide. */
  yaEstan: VisualDeAnuncio[];
}

interface AnuncioCorto {
  id: string;
  name: string;
  imagePrompt: string;
  format: string;
}

export function tandaDeImagenes(
  anuncios: AnuncioCorto[],
  imagenes: { adId?: string }[],
): TandaDeImagenes {
  /*
   * Solo las que cuelgan de un anuncio.
   *
   * Las de un copy o de una landing llegan con `adId` vacío. Si contaran, un
   * anuncio sin imagen propia parecería tenerla y el botón lo saltaría — y el
   * fallo no se vería hasta mirar la campaña montada y encontrar el hueco.
   */
  const conImagen = new Set(
    imagenes.map((imagen) => imagen.adId).filter((id): id is string => Boolean(id)),
  );

  const faltan: VisualDeAnuncio[] = [];
  const yaEstan: VisualDeAnuncio[] = [];

  for (const anuncio of anuncios) {
    // Sin prompt no hay nada que generar. Contarlo daría un botón que promete
    // siete y hace seis, que es peor que no ofrecerlo.
    if (!anuncio.imagePrompt.trim()) continue;

    const visual: VisualDeAnuncio = {
      title: anuncio.name,
      prompt: anuncio.imagePrompt,
      // Los anuncios de Meta se montan en cuadrado; es lo que ya hacía la fila
      // de cada anuncio antes de que existiera el lote.
      aspectRatio: "1:1",
      concept: anuncio.format,
      // El nombre del anuncio da nombre al archivo: es lo que lo hace
      // reconocible cuando te bajas veinte de una carpeta.
      origin: anuncio.name,
      adId: anuncio.id,
    };

    if (conImagen.has(anuncio.id)) yaEstan.push(visual);
    else faltan.push(visual);
  }

  return { faltan, yaEstan };
}
