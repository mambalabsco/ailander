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
