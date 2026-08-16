import type { FunnelStage } from "../types/campaign.ts";

/**
 * Qué se le pide a una tanda: el embudo entero o una sola etapa.
 *
 * Sin imports de valor, probado en `alcance-de-tanda.test.ts`.
 *
 * ## Por qué existe
 *
 * Hasta el 16 de agosto **siempre** montaba el embudo completo —«de dos a cuatro
 * conjuntos, y que no sean todos de la misma etapa»— y la pantalla no lo decía
 * en ningún sitio: el desplegable se llamaba «Etapa del embudo», como si la
 * tanda entera fuera de esa etapa. No se podía pedir una tanda de una sola, que
 * es lo que hace falta cuando el embudo ya está montado y solo quieres más BOFU.
 *
 * El texto vive aquí y no dentro de `short-ad-prompts.ts` porque ese módulo
 * importa `buildProductContext` con alias y no se puede cargar desde un test. Y
 * lo que hay que poder comprobar es justo esto: que los dos textos piden cosas
 * distintas.
 */
export type AlcanceDeTanda = "embudo" | "etapa";

export function batchScopeRule(input: {
  alcance: AlcanceDeTanda;
  stage: FunnelStage;
  count: number;
}): string {
  const { alcance, stage, count } = input;

  if (alcance === "etapa") {
    return `Monta **un solo conjunto de anuncios**, de etapa **${stage}**, dentro de una campaña propia.

**No añadas conjuntos de otras etapas**: esta tanda es de ${stage} y de nada más.

Ese conjunto lleva **exactamente ${count} anuncios**. Cada uno es una pieza independiente: distinto gancho, distinta entrada y distinto enfoque. Si dos se pudieran intercambiar sin que se note, están mal.`;
  }

  return `Monta **una campaña completa**, no un conjunto suelto.

Devuelve **de dos a cuatro conjuntos de anuncios dentro de la misma campaña**, y que **no sean todos de la misma etapa del embudo**. Una campaña real mezcla:

- **TOFU** — entra por el problema, a quien todavía no sabe qué lo causa.
- **MOFU** — entra por el mecanismo, a quien ya probó cosas que fallaron.
- **BOFU** — entra por la oferta, a quien ya sabe qué es y duda del precio o la garantía.

El conjunto de **${stage}** es el de **entrada** y debe estar. Los demás los decides tú según lo que pida este producto y esta investigación: si el público ya conoce la categoría, pesa más MOFU y BOFU; si el problema ni se nombra, pesa más TOFU.

Cada conjunto lleva su propia etapa, su enfoque, su audiencia y su objetivo. **En total tienen que salir exactamente ${count} anuncios**, repartidos entre los conjuntos como mejor encaje —no ${count} por conjunto—. Cada anuncio es una pieza independiente: distinto gancho, distinta entrada y distinto enfoque. Si dos anuncios se pudieran intercambiar sin que se note, están mal.`;
}
