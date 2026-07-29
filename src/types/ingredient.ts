/**
 * Los ingredientes del producto, con lo que hace cada uno.
 *
 * **Un nombre suelto no sirve para escribir.** El producto guardaba
 * `ingredients: string[]` —solo nombres— y ni siquiera llegaban a los prompts.
 * Un copy que cierre como debe necesita decir qué hace cada ingrediente y por
 * qué esa forma concreta: «selenometionina, no selenito barato» vende; «contiene
 * selenio» no dice nada.
 */

export interface ProductIngredient {
  name: string;
  /** Qué hace, en términos de mecanismo. Es lo que el copy convierte en razón. */
  role: string;
  /**
   * La forma concreta y por qué importa frente a la barata.
   *
   * Suele ser el argumento más fuerte del cierre: distingue el producto de los
   * genéricos que llevan el mismo ingrediente en una forma que no se absorbe.
   */
  form?: string;
  dose?: string;
  /**
   * De dónde salió este dato.
   *
   * **La distinción no es cosmética.** Un ingrediente leído de la ficha es un
   * hecho; uno deducido por el modelo es una hipótesis. En un suplemento, dar
   * por hecho lo segundo acaba en un anuncio que afirma algo que el producto no
   * contiene — un problema legal y de salud, no de estilo.
   */
  source: "web" | "inferido";
}

/** Qué se pudo leer de la web y qué hubo que deducir. */
export interface IngredientAnalysis {
  ingredients: ProductIngredient[];
  /** Lo que no se encontró en la web y por qué. */
  notes: string[];
}
