import type { Product } from "@/types";
import type { MarketContext } from "@/lib/market-selection";
import type { ProductResearch } from "@/types/research";
import type { MarketingAngle } from "@/types/copy";
import type { AdSet, FunnelStage, Prelanding, ShortAdFormat } from "@/types/campaign";
import {
  FUNNEL_STAGE_META,
  formatMeta,
  SHORT_AD_FORMATS,
  destinationLabel,
  formatsForStage,
} from "@/types/campaign";
import { buildProductContext } from "@/lib/copy-prompts";
import { reglaDeMedidas } from "@/lib/medidas-de-anuncio";
import { INSTRUCCIONES_VISUALES, reglasVisuales } from "@/lib/gramatica-visual";
import { FACEBOOK_LIMITS } from "@/types/copy";
import { copyLevelRule } from "@/lib/nivel-de-copia";
import { batchScopeRule } from "@/lib/alcance-de-tanda";
import type { AlcanceDeTanda } from "@/lib/alcance-de-tanda";
import type { NivelDeCopia } from "@/lib/nivel-de-copia";
import type { Anatomia } from "@/lib/anatomia";
import type { Store } from "@/types/store";

/**
 * Anuncios cortos, en el formato de `short.md`.
 *
 * Cada anuncio son tres piezas que van juntas y se generan de una vez:
 * el **prompt de imagen** (con los textos exactos que van incrustados), y el
 * **copy** con titular, texto y descripción.
 *
 * Diferencias con el long copy que conviene no perder de vista:
 * - El texto es corto y escaneable, de una o dos líneas por párrafo, con emojis
 *   como viñetas y la escalera de precios visible.
 * - El titular y la descripción llevan sus medidas dentro del encargo
 *   (`reglaDeMedidas`), y eso **no es cosmético**: antes se pedían «una o dos
 *   frases» y una descripción de cinco campos, y el servidor recortaba a 40 y 30
 *   sin decírselo al modelo. Salían titulares a media frase y la misma
 *   descripción en todos los anuncios.
 * - La URL va en el texto pero **nunca dentro de la imagen**.
 */

/** Cuántos anuncios pide una tanda por defecto. */
export const DEFAULT_BATCH_SIZE = 10;


/**
 * Prompt para generar una tanda de anuncios cortos.
 *
 * Devuelve la instrucción completa lista para Claude, con el contexto del
 * producto, la configuración del conjunto de anuncios y el formato de salida
 * pieza por pieza.
 */
export function buildShortAdBatchPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  marketContext: MarketContext;
  adset: AdSet;
  prelandings: Prelanding[];
  angle?: MarketingAngle;
  /**
   * El material del que sale la tanda, cuando no sale de un ángulo.
   *
   * **Sustituye** al bloque del ángulo, no se suma: dos orígenes a la vez son
   * dos instrucciones que se pisan, y el modelo acaba obedeciendo a la última.
   */
  origen?: { anatomia: Anatomia; nivel: NivelDeCopia };
  /**
   * Si la tanda monta el embudo entero o un solo conjunto de su etapa.
   *
   * Hasta el 16 de agosto siempre montaba el embudo y no se podía pedir otra
   * cosa, aunque la pantalla dijera «Etapa del embudo» como si se pudiera.
   */
  alcance?: AlcanceDeTanda;
  /**
   * Los datos de la creatividad de casino: bono, premios, ganadores.
   *
   * Van aparte del resto porque **ningún documento los puede saber** —cuánto
   * regala el bono esta semana, quién ganó y en qué comuna— y sin ellos el
   * modelo se los inventa: un nombre propio con su comuna y una cifra de premio.
   */
  casino?: string;
  count?: number;
  /** Formatos concretos; si no se indican, se reparten los de la etapa. */
  formats?: ShortAdFormat[];
  /** Número del primer anuncio de la tanda, para la numeración correlativa. */
  startNumber: number;
}): string {
  const {
    product,
    research,
    adset,
    prelandings,
    angle,
    count = DEFAULT_BATCH_SIZE,
    alcance = "embudo",
    startNumber,
  } = options;

  const stageMeta = FUNNEL_STAGE_META[adset.stage];
  const destination = destinationLabel(adset.destination, prelandings);
  const destinationUrl =
    adset.destination.type === "prelanding"
      ? prelandings.find((item) => item.id === adset.destination.prelandingId)?.url
      : adset.destination.url || product.landingUrl;

  const formats = resolveFormats(adset.stage, count, options.formats, product.vertical);

  const openInvitation = `

**Los formatos de abajo son referencia, no una lista cerrada.** Si para este producto, este público y esta etapa hay un formato mejor que ninguno de ellos, úsalo: escribe su identificador en minúsculas y con guiones (por ejemplo \`demostracion-en-vivo\` o \`carta-del-fundador\`) y explica en el campo de instrucción visual cómo se ve. Prefiere uno conocido cuando encaje —tienen ficha y recorrido—, y proponte uno nuevo cuando de verdad aporte algo distinto.`;

  const formatList = formats
    .map((format, index) => {
      const meta = formatMeta(format);
      // Un formato inventado no tiene instrucción visual escrita; se dice en vez
      // de dejar «undefined» dentro del prompt.
      const brief =
        INSTRUCCIONES_VISUALES[format] ?? "Decide tú el tratamiento visual y descríbelo.";
      return `${startNumber + index}. **${meta.name}** — ${meta.role}\n   Instrucción visual: ${brief}`;
    })
    .join("\n\n");

  /*
   * El material va donde iba el ángulo, y con la misma forma.
   *
   * El resto del encargo —formatos, estructura de campaña, reglas— no distingue
   * de dónde salió la idea, y esa es justo la razón de que esto no sea una
   * segunda ruta de generación que se desincronice de la primera.
   */
  const { origen } = options;
  const origenBloque = origen
    ? `### El anuncio que ya funcionó

- Cómo entra: ${origen.anatomia.entrada}
- Qué promete: ${origen.anatomia.promesa}
- A quién le habla: ${origen.anatomia.publico}
- El deseo que explota: ${origen.anatomia.deseo}
- Ritmo y tono: ${origen.anatomia.ritmo}
- Qué enseña: ${origen.anatomia.queEnsena}
- Cómo cierra: ${origen.anatomia.cierre}
- Por qué funciona: ${origen.anatomia.porQueFunciona}

Estructura:
${origen.anatomia.estructura.map((item) => `- ${item.parte}: ${item.papel}`).join("\n")}

Objeciones que toca:
${origen.anatomia.objeciones.map((item) => `- ${item.objecion} → ${item.comoLaResuelve}`).join("\n")}

### Con qué cercanía copiarlo

${copyLevelRule(origen.nivel, origen.anatomia.ownership)}`
    : "";

  return `${buildProductContext(product, research, options.store, options.marketContext)}

## Conjunto de anuncios

- Campaña y conjunto: **${adset.name}**
- Etapa del embudo: **${adset.stage}** — ${stageMeta.approach}
- Enfoque: ${adset.focus}
- Audiencia: ${adset.audience}
- Objetivo: ${adset.objective}
- **Destino de todos los anuncios: ${destination}**${destinationUrl ? `\n- URL de destino: ${destinationUrl}` : ""}

${
  adset.offerStack.length > 0
    ? `### Oferta anclada en todos los anuncios\n\n${adset.offerStack.map((item) => `- ${item}`).join("\n")}`
    : ""
}

${
  adset.alwaysInclude.length > 0
    ? `### Elementos que deben aparecer siempre en el copy\n\n${adset.alwaysInclude.map((item) => `- ${item}`).join("\n")}`
    : ""
}

${
  origenBloque ||
  (angle
    ? `### Ángulo de la tanda\n\n**${angle.name}** — ${angle.targetAudience}\n\n- Mecanismo del problema: ${angle.problemMechanism}\n- Mecanismo de la solución: ${angle.solutionMechanism}\n- Momento emotivo: ${angle.emotionalMoment}`
    : "")
}

## Tarea

${options.casino ? `${options.casino}\n` : ""}
${batchScopeRule({ alcance, stage: adset.stage, count })}
${
  origen
    ? `
**Toda esta campaña va del ángulo del anuncio de arriba**, no del resto de la investigación. El deseo, el reencuadre y el tema son los suyos; la investigación del producto está para sostener lo que se afirme, **no para cambiar de qué habla la campaña**. Si acabas escribiendo sobre otro problema del producto, te has salido del encargo.

Eso vale también para los conjuntos de TOFU y MOFU: entran por el problema y por el mecanismo **de este ángulo**, no por los del producto en general.
`
    : ""
}
En el campo \`name\` de cada anuncio escribe **solo el gancho en pocas palabras**, sin prefijos ni numeración: el nombre completo lo monta la plataforma.

${reglasVisuales({ total: count })}

### Formatos de esta tanda

${formatList}
${openInvitation}

## Formato de salida, por cada anuncio

**NOMBRE:** \`Ad{número}_{Formato}_{Gancho corto}\` — usa la numeración correlativa que se indica arriba.

**PROMPT:** la instrucción de imagen completa en inglés, con este nivel de detalle:
- fondo y ambiente,
- elemento visual principal y posición del producto,
- **los textos exactos que van incrustados**, indicando color, tamaño relativo y qué va resaltado,
- referencia de estilo y una línea final: \`NO URL on image\`.

**HEADLINE:** una frase con gancho. Puede empezar con un emoji.

**TEXTO:** el cuerpo del anuncio. Párrafos de una o dos líneas con saltos entre medias. Emojis como viñetas. Escaneable en el feed sin ampliar. Entre 150 y 350 palabras: esto es un anuncio corto, no un publirreportaje. Incluye la escalera de precios cuando la etapa sea BOFU, con el precio anterior tachado. Termina con la llamada a la acción y la URL de destino.

${reglaDeMedidas(FACEBOOK_LIMITS)}

## Reglas

- La URL va en el texto, **nunca dentro de la imagen**.
- Nada de promesas médicas ni de resultados garantizados. Si hay testimonios, añade que los resultados pueden variar.
- Usa el lenguaje del cliente que aparece en la investigación y evita el que está marcado como prohibido.
- Escribe en ${product.language} y con el vocabulario de ${product.country}.

Devuelve los ${count} anuncios —ese total, sumando todos los conjuntos— uno detrás de otro, separados y numerados.`;
}

/**
 * Reparte formatos para una tanda.
 *
 * Prioriza los que rinden en la etapa; si se piden más anuncios que formatos
 * disponibles, repite en el mismo orden en vez de inventar formatos nuevos.
 */
export function resolveFormats(
  stage: FunnelStage,
  count: number,
  explicit?: ShortAdFormat[],
  vertical: "ecommerce" | "casino" = "ecommerce",
): ShortAdFormat[] {
  if (explicit && explicit.length > 0) {
    return Array.from({ length: count }, (_, index) => explicit[index % explicit.length]);
  }

  const stageFormats = formatsForStage(stage, vertical).map((meta) => meta.id);
  const pool = stageFormats.length > 0 ? stageFormats : [...SHORT_AD_FORMATS];

  return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
}
