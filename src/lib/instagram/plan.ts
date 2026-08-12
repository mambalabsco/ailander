import { FORMATS, VISIBLE_MAX } from "./content.ts";

/**
 * Lo que separa un generador de piezas de un community manager.
 *
 * Un generador contesta «dame tres» y cada tanda empieza de cero: a la tercera
 * vez ha escrito tres veces la misma publicación con otras palabras, porque no
 * sabe qué dijo antes. Un CM mira lo que ya salió, y por eso no se repite y
 * alterna lo que vende con lo que solo aporta.
 *
 * Aquí vive esa memoria: qué se publicó, qué toca esta semana y qué no volver a
 * hacer por ahora.
 */

export interface Seen {
  format: string;
  scene: string;
  /** La primera línea. Es lo que de verdad hay que no repetir. */
  first: string;
  showsProduct: boolean;
}

/**
 * Lo anterior, resumido para el encargo.
 *
 * Se manda **la primera línea y la escena**, no el pie entero: con veinte
 * publicaciones completas el contexto se dispara y lo que hay que evitar
 * —repetir el gancho o la misma foto— cabe en dos líneas por pieza.
 *
 * Se limita a las últimas quince. Más atrás ya no es repetirse: es tener una
 * línea, que es lo que se busca.
 */
export function recentSummary(seen: Seen[], max = 15): string {
  const últimas = seen.slice(0, max);

  if (últimas.length === 0) return "";

  return [
    `## Lo que ya se publicó (no repetir)`,
    ``,
    ...últimas.map(
      (one) =>
        `- [${one.format}${one.showsProduct ? ", con producto" : ""}] «${one.first.slice(0, VISIBLE_MAX)}» · ${one.scene.slice(0, 140)}`,
    ),
    ``,
    `Ni el mismo gancho, ni la misma escena, ni el mismo formato dos veces seguidas.`,
  ].join("\n");
}

/**
 * Qué formato toca cada día de la semana.
 *
 * ## Por qué se reparte y no se elige al azar
 *
 * Porque una cuenta que publica cinco reels seguidos y luego nada durante
 * cuatro días parece abandonada aunque tenga el mismo número de piezas. El
 * ritmo es la mitad del trabajo de un CM, y el ritmo se decide antes.
 *
 * El reparto empieza por donde se quedó la última vez —`from`— para que dos
 * semanas seguidas no arranquen las dos con lo mismo.
 */
export function weekPlan(days: number, from = 0): string[] {
  /*
   * Un reel de cada tres, y las historias fuera del plan.
   *
   * El reel es lo único que alcanza a quien no te sigue, así que no puede ser
   * una rareza; pero es lo que más cuesta producir y llenar la semana de reels
   * termina en semanas sin publicar.
   *
   * La historia entra desde que el agente publica solo. Cuando lo hacía una
   * persona no tenía sentido programarla con siete días —dura veinticuatro
   * horas y se decide sobre la marcha—, pero un agente que publica a diario sí
   * puede sostener el hueco diario que Instagram premia.
   */
  const ciclo = ["reel", "feed", "carrusel", "historia"];
  const plan: string[] = [];

  for (let i = 0; i < Math.max(0, days); i += 1) {
    plan.push(ciclo[(from + i) % ciclo.length]);
  }

  return plan;
}

/** Cuántas de cada formato hay que pedir para cubrir un plan. */
export function countsFor(plan: string[]): { format: string; count: number }[] {
  const cuenta = new Map<string, number>();

  for (const one of plan) cuenta.set(one, (cuenta.get(one) ?? 0) + 1);

  // En el orden del catálogo y no en el de aparición: así la pantalla enseña
  // siempre las mismas filas en el mismo sitio.
  return FORMATS.filter((one) => cuenta.has(one.id)).map((one) => ({
    format: one.id,
    count: cuenta.get(one.id) ?? 0,
  }));
}
