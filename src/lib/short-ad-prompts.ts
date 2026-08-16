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
 * - La descripción sigue un patrón fijo separado por puntos medios:
 *   `Marca · Oferta · Envío · Garantía · Zona`.
 * - La URL va en el texto pero **nunca dentro de la imagen**.
 */

/** Cuántos anuncios pide una tanda por defecto. */
export const DEFAULT_BATCH_SIZE = 10;

/** Instrucción visual de cada formato, con el nivel de detalle de `short.md`. */
const FORMAT_IMAGE_BRIEFS: Record<string, string> = {
  "cuaderno-manuscrito": `Cuaderno de espiral realista sobre mesa de madera, luz cálida, aire hecho a mano y auténtico. En la hoja, texto **manuscrito** en varios colores (boli azul, rojo, verde) con frases clave resaltadas en subrayador amarillo, rosa y verde. El producto apoyado sobre el cuaderno o al lado, foto real compuesta. El bloque final en rojo grande con la oferta. Estilo personal, nada corporativo.`,
  "beneficios-flotantes": `Fondo degradado limpio en el color de marca. Persona real del público objetivo, sonriendo con naturalidad y sosteniendo el producto a la altura del pecho, mirando a cámara. Alrededor de la cara y el cuerpo, **etiquetas flotantes en forma de píldora blanca con texto oscuro**, cada una nombrando un resultado concreto. Arriba, el precio en blanco muy grande. Abajo, barra redondeada oscura con la llamada a la acción.`,
  "urgencia-countdown": `Escena exterior luminosa acorde a la temporada. A un lado, un reloj despertador grande como icono; al otro, el producto de pie en la escena. Detrás, un cartel de colores con el descuento en cifras grandes. Texto superpuesto en blanco con sombra marcada: la tensión temporal arriba y el plazo restante en amarillo. Alta energía y contraste.`,
  "comparativa-precio": `Infografía limpia de comparación de precio sobre fondo oscuro de marca. Cuatro cajas en fila: tres alternativas cotidianas en gris apagado con su coste diario y una X roja, y la cuarta caja destacada con borde de color como ganadora, con el coste diario del producto y un check verde. Debajo, una línea en negrita con el coste por día y otra con lo que se obtiene por ese precio.`,
  "testimonios-grid": `Fondo claro con acentos de marca. Tres tarjetas de testimonio en rejilla, cada una con foto circular de perfil realista, cinco estrellas, una cita corta y creíble, y nombre con ciudad. Debajo, caja de oferta en color oscuro con el pack recomendado y sus ventajas con checks. A un lado, el producto destacado. Abajo, barra con la valoración media y el número de reseñas.`,
  "antes-despues": `Dos encuadres idénticos lado a lado, misma luz y mismo ángulo, separados por una línea fina y etiquetados "Antes" y "Después" en tipografía clara. La diferencia debe verse pero mantenerse creíble. Producto pequeño en una esquina. Fondo neutro.`,
  "ugc-selfie": `Foto tipo móvil, sin producción: alguien del público objetivo sosteniendo el producto en su casa, luz de ventana, encuadre ligeramente descentrado e imperfecto. Debe parecer una foto enviada a una amiga, no una campaña. Sin texto incrustado.`,
  "mecanismo-explicado": `Diagrama simple y limpio sobre fondo claro que explica en tres pasos por qué ocurre el problema, con iconos sencillos y flechas. Tipografía grande y legible, nada de jerga. El producto aparece al final del recorrido como el punto que rompe la cadena.`,
  "packshot-oferta": `Producto sobre fondo limpio y sin distracciones, con el precio y el ahorro dominando la composición en tipografía muy grande. Precio anterior tachado y precio nuevo destacado. Sellos de envío y garantía en pequeño. Mucho aire.`,
  "pregunta-directa": `Fondo de color plano y saturado con una única pregunta en tipografía muy grande que ocupa casi todo el encuadre. El producto pequeño en una esquina inferior. Sin más elementos: la pregunta es la creatividad.`,
};

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

  const formats = resolveFormats(adset.stage, count, options.formats);

  const openInvitation = `

**Los formatos de abajo son referencia, no una lista cerrada.** Si para este producto, este público y esta etapa hay un formato mejor que ninguno de ellos, úsalo: escribe su identificador en minúsculas y con guiones (por ejemplo \`demostracion-en-vivo\` o \`carta-del-fundador\`) y explica en el campo de instrucción visual cómo se ve. Prefiere uno conocido cuando encaje —tienen ficha y recorrido—, y proponte uno nuevo cuando de verdad aporte algo distinto.`;

  const formatList = formats
    .map((format, index) => {
      const meta = formatMeta(format);
      // Un formato inventado no tiene instrucción visual escrita; se dice en vez
      // de dejar «undefined» dentro del prompt.
      const brief = FORMAT_IMAGE_BRIEFS[format] ?? "Decide tú el tratamiento visual y descríbelo.";
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

**HEADLINE:** una o dos frases con gancho. Puede empezar con un emoji.

**TEXTO:** el cuerpo del anuncio. Párrafos de una o dos líneas con saltos entre medias. Emojis como viñetas. Escaneable en el feed sin ampliar. Entre 150 y 350 palabras: esto es un anuncio corto, no un publirreportaje. Incluye la escalera de precios cuando la etapa sea BOFU, con el precio anterior tachado. Termina con la llamada a la acción y la URL de destino.

**DESCRIPCIÓN:** una sola línea con elementos separados por punto medio, siguiendo este patrón:
\`Marca · Oferta · Envío · Garantía · Zona\`

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
): ShortAdFormat[] {
  if (explicit && explicit.length > 0) {
    return Array.from({ length: count }, (_, index) => explicit[index % explicit.length]);
  }

  const stageFormats = formatsForStage(stage).map((meta) => meta.id);
  const pool = stageFormats.length > 0 ? stageFormats : [...SHORT_AD_FORMATS];

  return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
}
