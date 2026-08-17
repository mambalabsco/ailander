/**
 * Qué piezas valen para una app.
 *
 * Sin imports, probado en `apps-alcance.test.ts`.
 *
 * ## Por qué «nulo es general» y no «hay que elegir app»
 *
 * Una historia sirve para varias apps: el fondo del pozo, el descubrimiento
 * casual y el retiro que llegó no cambian porque cambie el logo. Obligar a que
 * cada ángulo fuera de una app duplicaría el trabajo por app desde el primer
 * día, y acabaría con cinco copias del mismo ángulo que se desincronizan.
 *
 * Es el mismo significado que `market_id` en estas tablas, así que no es una
 * idea nueva en esta plataforma: es la que ya hay.
 */
export function anglesForApp<T extends { appId?: string }>(angles: T[], appId: string): T[] {
  // Sin app elegida no se filtra: es la lista completa del producto, que es lo
  // que hay que ver al administrar los ángulos.
  if (!appId) return angles;

  return angles.filter((angle) => !angle.appId || angle.appId === appId);
}

/*
 * Qué patrones de imagen se ofrecen en cada vertical.
 *
 * Los de siempre son de un **producto físico**: un frasco recortado, la textura
 * en macro, los ingredientes alrededor, el pack con su precio. En un casino no
 * hay envase que fotografiar, y ofrecerlos no da ningún error: el modelo se
 * inventa un frasco y se paga por él.
 *
 * Sin imports, probado en `apps-alcance.test.ts`. Los identificadores van como
 * cadenas y no importando `ProductImagePattern`: ese archivo tiene imports con
 * alias y no se puede cargar desde un test.
 */

/** Los que necesitan un envase delante. En casino no existen. */
const NECESITAN_PRODUCTO = [
  "packshot-principal",
  "packshot-angulo",
  "packshot-oferta",
  "producto-en-uso",
  "escala-en-mano",
  "detalle-textura",
  "composicion-ingredientes",
  "pack-oferta",
  "comparativa-alternativa",
  "antes-despues",
];

/** Los de la app. Fuera de casino no significan nada. */
const SOLO_CASINO = ["app-en-movil", "app-en-mano"];

export function patternsFor(vertical: "ecommerce" | "casino", todos: string[] = PATRONES): string[] {
  return todos.filter((id) => {
    // La captura nunca: se sube, no se genera. Una pantalla inventada se parece
    // a la app y no es la app, que es justo lo que rompe el anuncio.
    if (id === "captura-app") return false;

    return vertical === "casino" ? !NECESITAN_PRODUCTO.includes(id) : !SOLO_CASINO.includes(id);
  });
}

/** El orden en el que se ofrecen. Se pasa aparte para poder probarlo. */
const PATRONES = [
  "packshot-principal",
  "packshot-angulo",
  "producto-en-uso",
  "escala-en-mano",
  "detalle-textura",
  "composicion-ingredientes",
  "resena-estrellas",
  "comparativa-alternativa",
  "antes-despues",
  "pack-oferta",
  "captura-app",
  "app-en-movil",
  "app-en-mano",
];
