/**
 * El modelo tal y como lo ve la interfaz.
 *
 * Vive aparte del catálogo porque ese lleva `server-only` y el selector es un
 * componente de cliente: importar el tipo desde allí rompería el build.
 */
export interface CatalogModel {
  /** `job_type` en el CLI, `slug` en la API. Identifica el modelo en su vía. */
  slug: string;
  title: string;
  /** Qué vía lo sirve. Cambia cómo se lanza la generación, no solo de dónde sale. */
  source: "api" | "cli";
  /** Coste conocido. La API lo dice; el CLI, no — de ahí el nulo. */
  credits: number | null;
  /**
   * Si admite la foto del producto como referencia. Solo la vía CLI.
   *
   * `null` significa «todavía no se sabe»: el listado no siempre describe los
   * parámetros de cada modelo y se pregunta por el elegido antes de generar. Se
   * distingue de `false` a propósito — decir «no admite» sin haberlo comprobado
   * escondería justo la función que se quería.
   */
  acceptsReferences: boolean | null;
}
