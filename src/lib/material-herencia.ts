/**
 * Qué se puede reutilizar de un material, según de quién sea.
 *
 * Sin imports, probado en `material-herencia.test.ts`.
 *
 * Va en su propio archivo porque es **la regla que sostiene todo lo demás**, y
 * porque el fallo de saltársela es silencioso: sale un copy con una cifra que
 * nadie comprobó, dicha con la misma seguridad que las nuestras. No hay error
 * que avise de eso — se descubre cuando alguien pregunta de dónde sale el dato.
 *
 * Ojo con reescribir estos textos: entran en el encargo de la anatomía, que es
 * prefijo cacheado. Cambiarlos invalida la caché de esa tanda, que es barato;
 * meter aquí algo variable —una fecha, un contador— la invalida siempre, que no.
 */
export function inheritanceRule(ownership: "propio" | "ajeno"): string {
  if (ownership === "propio") {
    return "Este material es **nuestro y ya se lanzó**: sus promesas y sus cifras están comprobadas, así que se pueden reutilizar tal cual en los ángulos.";
  }

  return "Este material es **de otra marca**: reutiliza solo su construcción —cómo entra, cómo ordena, con qué ritmo—. **No atribuyas a nuestro producto ninguna cifra, resultado ni promesa concreta del anuncio**: son de otro producto y nadie las ha comprobado aquí.";
}
