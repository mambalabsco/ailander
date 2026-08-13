/**
 * Cuántos de los pedidos volvieron de verdad.
 *
 * Sin imports, probado en `angulos-vuelta.test.ts`.
 *
 * ## Por qué existe una función para algo tan corto
 *
 * Porque contar lo que devuelve el modelo y darlo por guardado ya costó una
 * noche entera: el resumen decía «doce textos reescritos» con la página
 * intacta, y no había forma de notarlo — un trabajo que acaba bien sin haber
 * hecho nada es indistinguible de uno que no arrancó.
 *
 * Lo que hay que contar es lo que **se casó**, y decir cuántos faltaron. Y las
 * posiciones no se corren nunca: casar el tercero pedido con el segundo
 * devuelto es como acaba un titular en el sitio del botón.
 */
export function matchByPosition<T>(
  pedidos: T[],
  vuelta: unknown[],
): { casados: number; sobran: number } {
  const casados = Math.min(pedidos.length, vuelta.length);
  return { casados, sobran: pedidos.length - casados };
}
