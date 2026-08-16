/*
 * Sin importar `inheritanceRule`, y a propósito.
 *
 * Esa regla la escribe la **anatomía**, donde el encargo es describir un anuncio
 * ajeno sin atribuirle nada al producto. Aquí el encargo es el contrario:
 * escribir con su idea. Compartir el texto fue justo lo que hizo que una tanda
 * saliera hablando de otra cosa — ver `claimRule`.
 */

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

/** El texto base de cada nivel. El tema del material se conserva en los tres. */
function levelText(nivel: NivelDeCopia): string {
  if (nivel === "mismo") {
    return "**Mismo enfoque.** Mantén el **tema, el deseo y el mecanismo** del material, y el mismo público. Lo que cambia es la ejecución: otro gancho, otra entrada, otro formato. No busques un ángulo nuevo — este ya funciona y lo que se quiere es más de esto.";
  }

  if (nivel === "ampliado") {
    return "**Parecido, con más ideas.** Conserva el **tema, el deseo y el mecanismo** del material, y añade **entradas nuevas**: otras objeciones, otro momento emocional, un público adyacente. Cada anuncio aporta algo que el material no tenía, **sin cambiar de qué va**.";
  }

  return "**Solo como referencia.** De aquí se toma cómo está construido —cómo entra, en qué orden coloca las partes, con qué ritmo y cómo cierra— y también **su idea de fondo**: el deseo que explota y el reencuadre que propone. Lo que se rellena con nuestra investigación son los hechos, no el ángulo.";
}

/**
 * Qué se puede afirmar, según de quién sea el material.
 *
 * ## El fallo del 16 de agosto, que es la razón de que esto esté separado
 *
 * Antes, «ajeno» decía «reutiliza **solo su construcción**». El modelo hizo caso
 * al pie de la letra: tiró el ángulo del material —un anuncio de colesterol
 * sobre evitar la estatina— y rellenó con lo único que le quedaba, la
 * investigación del producto. Salió una campaña sobre cansancio y niebla mental
 * a partir de un anuncio sobre colesterol, y no falló nada: se pidió eso.
 *
 * La distinción, que está en la spec y yo había perdido: **el ángulo puede ir
 * tan lejos como haga falta; la frase que se publica, no.** De un material ajeno
 * se hereda la idea entera —el tema, el deseo, el reencuadre—; lo que no se
 * hereda son **sus cifras y sus resultados concretos**, porque son de otro
 * producto y nadie los ha comprobado aquí.
 */
function claimRule(ownership: "propio" | "ajeno"): string {
  if (ownership === "propio") {
    return "Este material es **nuestro y ya se lanzó**: sus promesas y sus cifras están comprobadas, así que se pueden repetir tal cual.";
  }

  return "Este material es **de otra marca**. Su **idea sí se hereda entera** —el tema, el deseo, el reencuadre, el mecanismo—: eso es justo lo que se ha venido a reutilizar. Lo que no se hereda son sus **datos**: **no atribuyas a nuestro producto ninguna cifra, porcentaje, plazo ni resultado concreto que aparezca en el anuncio**, porque son de otro producto y aquí no los ha comprobado nadie. Donde el material use un dato suyo, usa el nuestro si la investigación lo sostiene, y si no lo sostiene, dilo sin cifra.";
}

/**
 * La instrucción completa: qué se conserva del material y qué no se puede
 * afirmar de él.
 *
 * Las dos mitades van juntas siempre. Con solo la primera se cuela una cifra
 * ajena dicha como nuestra; con solo la segunda se pierde el ángulo, que es lo
 * que pasó el 16 de agosto.
 */
export function copyLevelRule(nivel: NivelDeCopia, ownership: "propio" | "ajeno"): string {
  return `${levelText(nivel)}\n\n${claimRule(ownership)}`;
}
