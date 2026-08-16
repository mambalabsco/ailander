/**
 * Una app de casino: el subproducto del que se descarga.
 *
 * En el vertical de casino el producto **es el país**, y dentro viven las apps.
 * El copy se escribe para una, porque es lo que la persona acaba descargando, y
 * su enfoque es lo que la distingue de las demás del mismo país.
 */
export interface CasinoApp {
  id: string;
  productId: string;
  name: string;
  /** Con qué entra esta app y no otra. Entra tal cual en el encargo del copy. */
  focus: string;
  /** A dónde va el tráfico del anuncio. */
  downloadUrl: string;
  position: number;
  createdAt: string;
}
