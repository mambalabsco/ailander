// Relativo y con extensión: es un import **de valor**, y con el alias `@/` el
// corredor de Node no lo resuelve y el test de este módulo no se puede cargar.
import { inheritanceRule } from "./material-herencia.ts";

/**
 * Con qué cercanía se copia un material que ya funcionó.
 *
 * Sin imports con alias, probado en `nivel-de-copia.test.ts`.
 *
 * ## Por qué el nivel y `ownership` son dos mandos y no uno
 *
 * El nivel dice cuánto se acerca **la forma**; `ownership` dice si **el
 * contenido** puede viajar. Se cruzan, y el cruce importa: «mismo enfoque» sobre
 * un anuncio de otra marca significa misma construcción y misma **clase** de
 * promesa —nunca sus cifras—, porque una cifra de otro anuncio es algo que dijo
 * otro sobre otro producto.
 *
 * Confundirlos no da ningún error. Da un anuncio que afirma un resultado que
 * nadie ha comprobado, dicho con la misma seguridad que los nuestros.
 *
 * Ojo al reescribir estos textos: entran en el encargo de la tanda. Meter aquí
 * algo variable —una fecha, un contador— no falla: rompe el prefijo cacheado y
 * se paga entero sin que nadie se entere.
 */

export type NivelDeCopia = "mismo" | "ampliado" | "referencia";

/** Los tres, en el orden en el que se ofrecen: de más pegado a más suelto. */
export const NIVELES: { id: NivelDeCopia; nombre: string; explicacion: string }[] = [
  {
    id: "mismo",
    nombre: "Mismo enfoque",
    explicacion:
      "Misma promesa, mismo mecanismo, mismo público. Cambia la ejecución. Es lo de escalar un ganador sin romperlo.",
  },
  {
    id: "ampliado",
    nombre: "Parecido, con más ideas",
    explicacion:
      "Conserva el mecanismo y el deseo, y busca entradas nuevas: otras objeciones, otro momento, un público de al lado.",
  },
  {
    id: "referencia",
    nombre: "Solo como referencia",
    explicacion:
      "Se toma cómo está construido —cómo entra, cómo ordena, cómo cierra— y el contenido sale de la investigación del producto.",
  },
];

/** El texto base de cada nivel, que cambia si el material es de otra marca. */
function levelText(nivel: NivelDeCopia, ownership: "propio" | "ajeno"): string {
  if (nivel === "mismo") {
    return ownership === "propio"
      ? "**Mismo enfoque.** Mantén la **misma promesa**, el mismo mecanismo y el mismo público del material. Lo que cambia es la ejecución: otro gancho, otra entrada, otro formato. No busques un ángulo nuevo — este ya funciona y lo que se quiere es más de esto."
      : "**Mismo enfoque.** Mantén la construcción y la **misma promesa** en su *clase* —el mismo tipo de resultado y el mismo mecanismo—, pero dicha con lo que nuestra investigación sostiene. Lo que cambia es la ejecución: otro gancho, otra entrada, otro formato.";
  }

  if (nivel === "ampliado") {
    return ownership === "propio"
      ? "**Parecido, con más ideas.** Conserva el mecanismo y el deseo del material, y añade **entradas nuevas**: otras objeciones, otro momento emocional, un público adyacente. Cada anuncio tiene que aportar algo que el material no tenía."
      : "**Parecido, con más ideas.** Conserva el mecanismo y el deseo del material, y añade **entradas nuevas** —otras objeciones, otro momento emocional, un público adyacente— sostenidas por nuestra investigación, no por lo que prometía el otro anuncio.";
  }

  return "**Solo como referencia.** Toma de aquí únicamente la construcción: cómo entra, en qué orden coloca las partes, con qué ritmo y cómo cierra. Todo lo que se afirme sale de la **investigación** de nuestro producto, no del material.";
}

/**
 * La instrucción completa: el nivel, y encima qué se puede heredar.
 *
 * Las dos van juntas siempre. Devolver solo el nivel dejaría que «mismo enfoque»
 * arrastrara las cifras de otra marca, que es justo lo que la otra regla existe
 * para impedir.
 */
export function copyLevelRule(nivel: NivelDeCopia, ownership: "propio" | "ajeno"): string {
  return `${levelText(nivel, ownership)}\n\n${inheritanceRule(ownership)}`;
}
