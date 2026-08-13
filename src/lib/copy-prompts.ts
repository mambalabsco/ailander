import type { Product } from "@/types";
import type { AwarenessLevel, ProductResearch } from "@/types/research";
import { AWARENESS_LABELS } from "@/types/research";
import type { CopyMethod, MarketingAngle } from "@/types/copy";
import { FACEBOOK_LIMITS } from "@/types/copy";
import type { Store } from "@/types/store";
import { currencyOf } from "@/lib/money";
import { priceLine } from "@/lib/market-price";
import { marketLines, type MarketContext } from "@/lib/market-selection";
import { describeOffers, type ProductOffers } from "@/types/offer";
import { describeNotes, type ProductNote } from "@/types/note";
import { lengthBrief } from "@/lib/word-count";

/**
 * Constructores de los prompts de copy, fieles a `longs.md`.
 *
 * Dos decisiones de diseño que conviene tener presentes:
 *
 * 1. Los prompts 8 y 10 comparten cuerpo literal, así que aquí hay **una sola**
 *    función de long copy con un origen intercambiable (deseo o ángulo). El
 *    documento los presentaba separados porque el autor copió el bloque y solo
 *    cambió la variable de entrada — incluso se dejó la etiqueta "para este
 *    deseo masivo" en el prompt del ángulo.
 *
 * 2. Ningún prompt del documento genera título ni descripción de Facebook. El
 *    bloque `FACEBOOK_OUTPUT_BLOCK` los añade al final de cada prompt para que
 *    el texto salga listo para pegar en el gestor de anuncios.
 */

/* ------------------------------ Contexto compartido ---------------------------- */

/**
 * Contexto del producto y su investigación.
 *
 * Va al principio de todos los prompts y no cambia entre llamadas, así que es el
 * prefijo que conviene marcar para el caché: los 5 ángulos y los copys de un
 * mismo producto lo reutilizan íntegro.
 */
/**
 * Todo lo que se puede saber del producto sin llamar a ningún modelo.
 *
 * La oferta y las notas del equipo se pasan aparte porque no viven en el
 * producto: la oferta tiene su propia tabla y las notas son una lista. Ambas
 * son opcionales para no obligar a cargarlas cuando no hacen falta.
 */
export interface ProductContextExtras {
  offers?: ProductOffers | null;
  notes?: ProductNote[];
  /** Copys ya probados, ya descritos por `describeSwipeCopies`. */
  swipe?: string;
}

export function buildProductContext(
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  /*
   * El mercado va **obligatorio y sin valor por defecto**.
   *
   * Es lo que obliga a visitar todos los sitios que escriben un encargo: un
   * valor por defecto que cayera al precio base dejaría que un encargo general
   * escribiera el precio de un país, y eso no falla, solo sale mal en la página
   * de otro sitio.
   *
   * Ojo con lo que se añada aquí: esto es el **prefijo cacheado** de las tandas
   * de ganchos, y la caché exige que sea idéntico byte a byte entre llamadas.
   * Una fecha o un contador metidos aquí no dan error: se paga entero.
   */
  marketContext: MarketContext,
  extras?: ProductContextExtras,
): string {
  const master = research.master;
  const avatars = research.avatars;

  /*
   * Nombrar la marca es decisión de la tienda.
   *
   * En muchas campañas de respuesta directa el nombre de la tienda distrae: el
   * lector no la conoce y no aporta nada. Cuando está desactivado, el prompt
   * recibe la instrucción de no escribirla en el cuerpo — el enlace sí sigue
   * llevando al dominio, porque eso no es texto.
   */
  const mentionBrand = store ? store.mentionBrandInCopy : true;

  /*
   * En general la línea del precio **desaparece entera**, no sale vacía ni a
   * cero: «Precio: 0» le está diciendo al modelo que el producto es gratis.
   *
   * Se esparce con `...` en vez de filtrar el array al final porque la línea en
   * blanco de después del título también es falsa para `filter(Boolean)`, y se
   * llevaría por delante la separación.
   */
  const priceText = priceLine("Precio", marketContext.price, marketContext.market?.currency ?? "");

  const lines: string[] = [
    "## Contexto del producto",
    "",
    `Producto: ${product.name}`,
    mentionBrand
      ? `Marca: ${product.brand}`
      : `Marca: ${product.brand} (NO la menciones en el texto)`,
    `Categoría: ${product.category}`,
    ...(priceText ? [priceText] : []),
    ...marketLines(marketContext.market, product.language),
    `Descripción: ${product.description}`,
    `Público objetivo: ${product.targetAudience}`,
  ];

  if (product.researchInputs?.niche) {
    lines.push(`Nicho: ${product.researchInputs.niche}`);
  }

  /*
   * Los ingredientes, con lo que hace cada uno.
   *
   * **No llegaban al prompt.** Se guardaban en la ficha y no los leía nadie, así
   * que el cierre del anuncio no podía explicar por qué esta fórmula y no otra
   * con los mismos nombres en la etiqueta. Eso es justo donde se decide la venta
   * en un suplemento: «selenometionina, no selenito barato» es un argumento;
   * «contiene selenio» no dice nada.
   *
   * Los deducidos van marcados. El modelo tiene que poder distinguir un dato de
   * la ficha de una hipótesis, porque afirmar en un anuncio que el producto
   * lleva algo que no lleva no es un error de estilo.
   */
  const ingredients = product.ingredientDetails ?? [];

  if (ingredients.length > 0) {
    lines.push("", "Ingredientes y qué hace cada uno:");
    for (const item of ingredients) {
      const parts = [item.form ? `${item.name} (${item.form})` : item.name, item.role];
      if (item.dose) parts.push(`Dosis: ${item.dose}`);
      if (item.source === "inferido") {
        parts.push("SIN CONFIRMAR en la ficha: no lo afirmes como dato del producto");
      }
      lines.push(`- ${parts.join(" — ")}`);
    }
  } else if (product.ingredients.length > 0) {
    // Solo nombres: se dan, pero sin mecanismo el cierre será más pobre.
    lines.push("", `Ingredientes (sin análisis): ${product.ingredients.join(", ")}`);
  }

  /*
   * Las objeciones que escribe el equipo en la ficha.
   *
   * **No llegaban al prompt.** Se editaban en «Editar producto» y no las leía
   * nadie más que el analizador de anuncios, así que quien las escribía veía que
   * los copys seguían sin rebatir lo que él sabe que preguntan los clientes — y
   * no había forma de saber que ese campo no iba a ninguna parte.
   *
   * Van separadas de las del documento 4 y dichas como lo que son: sabidas, sin
   * respuesta escrita. Mezclarlas con las de la investigación, que sí traen su
   * «cómo se resuelve», haría que el modelo se inventara la respuesta y la diera
   * con la misma seguridad que las comprobadas.
   */
  if (product.objections.length > 0) {
    lines.push(
      "",
      "Objeciones que conocemos de nuestros clientes (sin respuesta escrita: resuélvelas tú con lo que sepas del producto):",
      ...product.objections.map((item) => `- ${item}`),
    );
  }

  /*
   * La oferta va aquí arriba, con la ficha, y no al final.
   *
   * Un anuncio de fondo de embudo vende el pack de tres con su ahorro y su
   * regalo, no "el producto". Si esto llegara al final, después de mil líneas
   * de investigación, el modelo lo trataría como un apunte.
   */
  /*
   * Los copys que ya se probaron, como referencia.
   *
   * Van con la ficha y no al final: el modelo tiene que ver el patrón antes de
   * empezar a escribir, no después de mil líneas de investigación.
   */
  if (extras?.swipe) {
    lines.push("", extras.swipe);
  }

  if (extras?.offers) {
    const offerBlock = describeOffers(extras.offers, currencyOf(product, store));
    if (offerBlock) lines.push("", offerBlock);
  }

  if (!mentionBrand) {
    lines.push(
      "",
      "### Regla de marca",
      "",
      `No escribas el nombre de la marca («${product.brand}») en ninguna parte del texto. Refiérete siempre al producto por su nombre, «${product.name}». Esta regla no afecta al enlace, que lleva al dominio de la tienda.`,
    );
  } else if (store) {
    lines.push(`Tienda: ${store.brand} (${store.domain})`);
  }

  // Las notas van las últimas a propósito: son las que mandan, y lo último que
  // se lee es lo que más pesa.
  const notesBlock = describeNotes(extras?.notes ?? []);
  if (notesBlock) lines.push("", notesBlock);

  if (master) {
    lines.push(
      "",
      "## Lo que sabemos del cliente (documento 4)",
      "",
      `Descripción demográfica: ${master.demographicDescription}`,
      "",
      "Puntos de dolor, en sus propias palabras:",
      ...master.psychographics.painPoints.map((item) => `- ${item}`),
      "",
      "Esperanzas y sueños:",
      ...master.psychographics.hopesAndDreams.map((item) => `- ${item}`),
      "",
      `Cómo se ve a sí mismo: ${master.psychographics.selfImage}`,
      "",
      `Lenguaje que SÍ debes usar: ${master.psychographics.languageToUse.join(", ")}`,
      `Lenguaje que NO debes usar bajo ningún concepto: ${master.psychographics.languageToAvoid.join(", ")}`,
      "",
      "Promesas que podemos hacer:",
      ...master.psychographics.mainPromises.map((item) => `- ${item}`),
      "",
      "Objeciones y cómo se resuelven:",
      ...master.objections.map((item) => `- ${item.objection} → ${item.howToAddress}`),
      "",
      "Soluciones que ya ha probado y por qué no le bastan:",
      ...master.existingSolutions.map((item) => `- ${item.solution}: ${item.whyInsufficient}`),
    );
  }

  if (avatars?.quotes.length) {
    lines.push(
      "",
      "## Citas textuales de clientes reales (documento 3)",
      "",
      "Úsalas para calibrar el vocabulario. No las cites literalmente en el texto.",
      "",
      ...avatars.quotes.map((quote) => `- «${quote.text}» — ${quote.source}`),
    );
  }

  return lines.join("\n");
}

/* ------------------------ Bloque de salida para Facebook ----------------------- */

/**
 * El documento solo produce el cuerpo. Facebook pide tres campos, así que los
 * pedimos en la misma llamada en vez de dejar al usuario recortando a mano.
 */
const FACEBOOK_OUTPUT_BLOCK = `
## Formato de entrega

Devuelve tres piezas separadas y nada más:

1. **Texto principal**: el cuerpo completo que acabas de escribir, respetando la extensión pedida.
2. **Título**: máximo ${FACEBOOK_LIMITS.headline} caracteres. Es lo que aparece bajo la imagen en el gestor de anuncios de Meta. Debe funcionar leído solo, sin el cuerpo. No lo dejes en un resumen genérico.
3. **Descripción**: máximo ${FACEBOOK_LIMITS.description} caracteres. Refuerza el título, no lo repite.

El título y la descripción salen del cuerpo que has escrito: usan su misma idea y su mismo tono, sin lenguaje de marketing ni promesas que el cuerpo no sostenga.`;

/* --------------------------------- Prompt 9 ------------------------------------ */

/** Prompt 9: abre un deseo masivo en cinco ángulos con UMP y UMS propios. */
export function buildAnglesPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  marketContext: MarketContext;
  offers?: ProductOffers | null;
  notes?: ProductNote[];
  /** Copys ya probados, como referencia de patrón. */
  swipe?: string;
  desire: string;
  count?: number;
}): string {
  const { product, research, store, desire, count = 5 } = options;

  return `${buildProductContext(product, research, store, options.marketContext, {
    offers: options.offers,
    notes: options.notes,
    swipe: options.swipe,
  })}

## Tarea

Con base en la investigación anterior, crea ${count} ángulos de marketing fundamentalmente diferentes que aprovechen este deseo masivo:

**${desire}**

Recuerda: un ángulo es la HISTORIA que despierta el deseo de alguien. Cada ángulo debe contar una historia distinta que conecte con un segmento diferente de personas que comparten el mismo deseo.

## Requisitos críticos

- Cada ángulo debe partir de un "momento de realización" o punto de crisis DIFERENTE.
- Cada uno debe atraer a personas en circunstancias de vida distintas.
- Cada uno debe revelar el problema a través de una lente única.
- Usa las situaciones y el lenguaje reales de la investigación, no escenarios genéricos.

## Estructura de cada ángulo

- **Nombre del ángulo**: título descriptivo y concreto.
- **Público objetivo**: quién se reconoce específicamente en esta historia.
- **Arco argumental**: situación inicial → momento de crisis o realización → descubrimiento → resolución.
- **Mecanismo único del problema (UMP)**: qué causa específicamente el problema en ESTA historia. Debe ser contraintuitivo y explicar por qué las soluciones obvias fallan.
- **Mecanismo único de solución (UMS)**: cómo funciona la solución de forma distinta en ESTE contexto, atacando directamente al UMP.
- **Momento emotivo clave**: el punto de inflexión concreto.

## Prueba de distinción

¿Podrían ser ${count} personas distintas en una reunión de grupo de apoyo, cada una contando una historia completamente diferente sobre cómo descubrieron el mismo problema? Si dos historias se parecen, no son lo bastante distintas: reescríbelas.

Escribe en ${product.language}.`;
}

/* ------------------------------ Prompts 8 y 10 --------------------------------- */

/**
 * Cuerpo común de los prompts 8 y 10, reproducido del documento.
 *
 * Es literalmente el mismo texto en ambos; lo único que cambia es qué se
 * inserta como origen de la historia.
 */
function discoveryStoryBody(wordRange: [number, number]): string {
  return `Cuenta una historia personal y cruda de un descubrimiento desesperado que transforma la perspectiva del lector sobre su problema. Haz que sienta que le estás compartiendo algo que descubriste a las 2 de la madrugada y que lo cambió todo.

**LA HISTORIA QUE ESTÁS CONTANDO:** alguien en crisis descubre la VERDADERA razón de su problema, de la que nadie habla, y encuentra esperanza al comprender lo que realmente está pasando. Esto no es un anuncio: es alguien compartiendo un descubrimiento desesperado que salvó algo valioso.

**APERTURA:** crea un gancho irresistible que le haga querer saber qué pasa después. Una conversación, una observación o un momento tan específico e intrigante que no pueda dejar de leer. Máximo 20 palabras.

**DEJA QUE LA HISTORIA FLUYA:**

- Empieza con la vulnerabilidad: por qué esto importa tanto. Muestra el desgaste emocional en momentos cotidianos concretos. Construye hasta el punto de quiebre.
- Muestra la búsqueda desesperada: búsquedas nocturnas, consejos inútiles, marcas de tiempo. Intentos fallidos con las soluciones de siempre.

**EL DESCUBRIMIENTO** (elige lo que encaje con la historia): debe sentirse natural y espontáneo. NO recurras a publicaciones de foros ni de Reddit. En su lugar considera:

- Un médico o experto que por fin explica lo que está pasando de verdad.
- Tu propia observación, que de repente hace que todo encaje.
- Un libro o estudio que contradice lo que creías.
- El comentario casual de otra persona que te cambia la perspectiva.
- Un resultado de una prueba que revela el problema oculto.
- Probar algo distinto por desesperación y notar resultados inesperados.

El mecanismo único, tanto el del problema como el de la solución, surge a través de TU realización, no de conversaciones citadas.

Muestra escepticismo → esperanza → pequeños cambios → transformación, con detalles sensoriales concretos. Vuelve sobre lo que esto significa en TIEMPO, MOMENTOS y EXPERIENCIAS que habrías perdido. Termina con una urgencia suave: estás compartiendo información importante, no vendiendo.

**LOS MECANISMOS ÚNICOS, tejidos con naturalidad:**

- *Problema oculto:* la VERDADERA razón del fracaso, la que explica por qué las soluciones obvias no funcionan.
- *Solución real:* por qué este enfoque funciona cuando los otros fallan, conectando directamente con el problema oculto.

**ESTILO:** párrafos de 1 a 3 frases. Saltos de línea naturales. Detalles específicos (horas, nombres, números). Reacciones físicas. Tono conversacional. NADA de bloques de cita estilo foro.

**LO QUE DEBE SENTIR EL LECTOR:** esta persona pasó por lo mismo que yo. He encontrado algo que necesitaba saber. Esto explica por qué llevo tanto tiempo fracasando.

**EVITAR:** formato de Reddit o foro, secciones citadas largas, secciones estructuradas, explicar los mecanismos de forma directa, y lenguaje de marketing.

Extensión: entre ${wordRange[0]} y ${wordRange[1]} palabras.

Recuerda: no estás escribiendo un texto publicitario. Estás compartiendo un descubrimiento que ocurrió a las 2 de la madrugada y que lo cambió todo. Deja que cada momento lleve al siguiente.`;
}

/**
 * Long copy de Facebook.
 *
 * `driver` decide si la historia nace del deseo masivo (prompt 8, la pieza de
 * control) o de un ángulo concreto (prompt 10, cada variante).
 */
export function buildLongCopyPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  marketContext: MarketContext;
  offers?: ProductOffers | null;
  notes?: ProductNote[];
  /** Copys ya probados, como referencia de patrón. */
  swipe?: string;
  method: CopyMethod;
  awarenessLevel: AwarenessLevel;
  desire: string;
  angle?: MarketingAngle;
  hook?: string;
}): string {
  const { product, research, store, method, awarenessLevel, desire, angle, hook } = options;

  const source = angle
    ? `## Ángulo del que nace la historia

**${angle.name}**

- Público: ${angle.targetAudience}
- Arco: ${angle.storyArc.start} → ${angle.storyArc.crisis} → ${angle.storyArc.discovery} → ${angle.storyArc.resolution}
- Mecanismo único del problema (UMP): ${angle.problemMechanism}
- Mecanismo único de solución (UMS): ${angle.solutionMechanism}
- Momento emotivo clave: ${angle.emotionalMoment}

Este ángulo nace del deseo masivo: **${desire}**`
    : `## Deseo masivo del que nace la historia

**${desire}**

No hay ángulo definido: esta pieza es la línea base con la que se compararán las variantes por ángulo.`;

  const hookLine = hook
    ? `\n## Gancho de apertura\n\nUsa exactamente esta frase como primera oración del texto:\n\n«${hook}»\n`
    : "";

  return `${buildProductContext(product, research, store, options.marketContext, {
    offers: options.offers,
    notes: options.notes,
    swipe: options.swipe,
  })}

${source}
${hookLine}
## Nivel de conciencia

Escribe para un público **${AWARENESS_LABELS[awarenessLevel].toLowerCase()}**. Ajusta cuánto hay que explicar: no expliques lo que este público ya sabe ni des por sabido lo que aún desconoce.

## Tarea

${discoveryStoryBody(method.wordRange)}

Escribe en ${product.language}.
${FACEBOOK_OUTPUT_BLOCK}`;
}

/* ------------------------------- Advertorials ---------------------------------- */

/** Instrucciones específicas de cada marco de publirreportaje. */
const ADVERTORIAL_FRAMEWORKS: Record<string, string> = {
  /*
   * Listicle. Sacado de dos páginas reales que funcionan, no inventado:
   * `naturoxmexico.com/pages/lista-gluco` y
   * `pureveen.com/pages/listicle-fatty-liver-cirrhosis`.
   *
   * Lo que las dos comparten y define el formato: el titular lleva un número o
   * un descubrimiento, cada punto se titula **con las palabras del lector** —no
   * con jerga médica—, y **el producto no aparece hasta después de la lista**.
   * Esa espera es el formato: se lee salteado y engancha por reconocimiento
   * acumulado, no por una sola historia.
   */
  "advertorial-listicle": `Escribe un publirreportaje con formato de **lista numerada de señales**. Es el formato que se lee salteado: el lector baja rápido, se reconoce en dos o tres puntos y para.

**TITULAR:** o con número —«9 señales de que…»— o con descubrimiento —«Por fin descubrí por qué…»—. Máximo 14 palabras.

**ENTRADILLA:** dos o tres frases firmadas por una persona con nombre y apellido. Plantea el problema central y **la distinción que casi nadie hace** (dos tipos del mismo problema, dos causas que se confunden). No vendas todavía.

**LA LISTA:** entre 7 y 9 puntos numerados.

- Cada punto se titula **con las palabras que usaría el lector**, no con lenguaje clínico. «el dolor sordo bajo las costillas que todos dicen que no es nada», no «hepatalgia».
- Entre 50 y 100 palabras cada uno, en dos o tres párrafos cortos.
- Cada punto termina con una línea marcada — **Señal clave:** — que resume en una frase por qué esa señal importa.
- Los puntos van de lo evidente a lo que nadie relaciona. Los últimos son los que hacen decir «esto me pasa a mí».
- Al menos dos puntos deben ser **soluciones que el lector ya probó y fallaron**, explicando por qué fallaron. Es lo que le quita la culpa.

**EL GIRO:** después del último punto, un apartado corto del tipo «¿Y entonces qué sí funciona?». Aquí, y no antes, aparece el producto por primera vez. El mecanismo único explica por qué esto sí ataca lo que la lista ha ido describiendo.

**EL CIERRE:** oferta con su urgencia, garantía y varias llamadas a la acción del tipo «Verificar disponibilidad», nunca «Comprar ahora».

**AVISO LEGAL AL FINAL, OBLIGATORIO:** una línea que diga que esto es un publirreportaje y no un artículo de noticias, un blog ni una comunicación de una autoridad sanitaria. Sin ella la pieza se presenta como periodismo y no lo es.

**ESTILO:** frases por debajo de 15 palabras. Nivel de 5.º grado. Mucho espacio en blanco. Marca en **negrita** las cifras, las señales clave, la garantía y las llamadas a la acción.`,

  "advertorial-nightmare": `Eres un redactor experto de publirreportajes. Escribe un publirreportaje con formato de **testimonio de cliente**, nunca de venta de la empresa.

**GANCHO DE APERTURA:** una sola frase corta y contundente que vaya directa al fondo del dolor o del miedo, de 6 a 12 palabras. Debe golpear de inmediato.

**ESTRUCTURA RMBC, no negociable:**

*Entrada:* nombra el problema con datos y urgencia. Promete una solución y adelanta una historia de descubrimiento. Insinúa el mecanismo único de forma contraintuitiva. Construye credibilidad brevemente. Cualifica a la audiencia.

*Historia de fondo:* el narrador es un cliente, no el dueño del negocio. Conexión "yo era igual que tú". Las soluciones tradicionales fallando. Evento desencadenante o momento de crisis. Búsqueda de respuestas.

*Mecanismo único del problema:* explicación sorprendente y contraintuitiva. "El 99% sabe esto, pero el 1% que falta es...". Respaldo con credibilidad.

*Mecanismo único de solución:* conexión lógica con el problema. Metodología concreta. Por qué funciona cuando los demás fallan.

*Acumulación y revelación del producto:* el cliente lo descubre investigando. Historia de prueba y resultados. Evidencia. Otros se lo piden.

*Cierre:* detalles y diferenciadores del producto. Prueba social. Urgencia. Garantía. Justificación del precio. Varias llamadas a la acción. Cierre de dos opciones.

**FLUJO:** dolor → agitar → solución.

**ESTILO:** la mayoría de frases por debajo de 15 palabras. Palabras sencillas, nivel de 5.º grado. Párrafos de 1 a 3 frases con mucho espacio en blanco. Titulares que creen curiosidad y prometan beneficio, nunca empezando por "El". Marca en **negrita** las cifras clave, las revelaciones, los beneficios, la urgencia, la garantía y las llamadas a la acción.

**IMPORTANTE:** el producto lo fabrica una empresa independiente y las llamadas a la acción dirigen a "consultar disponibilidad", no a "estamos ofreciendo".`,

  "advertorial-authority": `Estás escribiendo un publirreportaje con el marco de **revelación de autoridad**: un experto creíble descubre una verdad oculta que contradice la sabiduría convencional y la hace pública para ayudar.

**APERTURA:** empieza con un contraste marcado del tipo "[el objetivo] debería haber [tenido éxito]. En cambio, [fracasó]". Desarrolla el reconocimiento con 3 o 4 frases del tipo "Si tú..." de especificidad creciente. Promete un descubrimiento que puede cambiarlo todo. Revela un problema generalizado con un porcentaje concreto. Contrapón el problema obvio al oculto con la estructura "Pero esto no es...".

**AUTORIDAD Y PUNTO DE RUPTURA:** presenta al experto con credenciales concretas y años de experiencia. Un caso "perfecto" que falla inexplicablemente. El impacto emocional de ese fracaso. La comprensión de que la sabiduría convencional está equivocada. La misión personal de encontrar respuestas.

**LA INVESTIGACIÓN — revela el UMP:** profundiza con números concretos. Muestra la desconexión entre los estándares oficiales y la realidad. El **mecanismo único del problema** debe ser contraintuitivo pero encajar de inmediato, con explicación científica o biológica. Muestra por qué fallan todos los enfoques tradicionales: "hemos estado pensando esto al revés". Revela por qué los instintos del lector eran correctos: "no estás loco, tenías razón".

**DESMONTAJE SISTEMÁTICO:** repasa cada solución común con la misma estructura — "¿Solución? Falla concreta. No ataca el [UMP]". Revela qué usan los profesionales en privado y pregunta por qué el público no tiene acceso.

**EL SECRETO PROFESIONAL — revela el UMS:** el **mecanismo único de solución** conecta directamente con el del problema. Explica por qué funciona cuando otros no, con una explicación técnica simplificada. Preséntalo como algo que ya existía, solo que oculto.

**PRUEBA:** cambios observables inmediatos. Ensayo con números concretos, en formato "X de Y mostró mejora". Experiencia personal del experto.

**CAMBIO DE PARADIGMA:** revela qué debería ser lo normal. Cuantifica la brecha. El peso emocional de una pérdida que no tenía que ocurrir.

**CIERRE:** desequilibrio entre oferta y demanda, garantía de 90 días, llamada a la acción clara.

**ESTILO:** números y plazos concretos. Subtítulos que funcionen como historias independientes: exponen hechos, no preguntas, e incluyen resultados. Párrafos de 1 a 4 frases. Revelaciones clave en **negrita**. Nivel de lectura de 5.º a 8.º grado. Incluye 3 testimonios al final con resultados concretos y al menos 3 llamadas a la acción repartidas.`,

  "advertorial-trial": `Escribe un publirreportaje con formato de **diario de prueba en primera persona**. El narrador es alguien escéptico que decidió probar el producto durante 30 días y documentó lo que pasaba.

**APERTURA:** deja claro el escepticismo desde la primera frase. El narrador no creía que fuera a funcionar y dice por qué, con la objeción exacta que tendría el lector.

**ESTRUCTURA POR HITOS**, con fechas o días concretos:

*Día 1:* por qué acabó probándolo pese a no creérselo. Qué había fallado antes.
*Primeros días:* nada evidente todavía. Reconócelo abiertamente — negarlo destruiría la credibilidad de todo lo que viene después.
*El primer indicio:* el detalle pequeño y concreto que le hizo dudar de su propio escepticismo. Sensorial, medible, específico.
*El punto de inflexión:* el momento en que dejó de dudar, y qué lo provocó.
*Día 30:* el resultado, contado sin exagerar.

**LOS MECANISMOS:** en algún punto de la prueba el narrador entiende por qué esto funcionaba y lo anterior no. Ahí entra el mecanismo único del problema, como comprensión propia. El mecanismo de solución aparece explicando por qué el producto sí lo ataca.

**REGLA CRÍTICA:** el escepticismo inicial es la prueba social. Si el narrador se entusiasma demasiado pronto, el texto deja de funcionar. Mantén las reservas hasta que haya evidencia concreta, y admite lo que no mejoró.

**ESTILO:** frases cortas, nivel de 5.º grado, párrafos de 1 a 3 frases. Fechas, cifras y detalles verificables. **Negrita** en los hitos y los resultados. Cierre con llamada a la acción y garantía.`,

  "advertorial-investigation": `Escribe un publirreportaje con formato de **reportaje de investigación**. El narrador es un periodista que se propuso averiguar por qué falla una categoría entera de productos.

**APERTURA:** un dato incómodo y concreto que no cuadra. Sin apelación emocional, sin segunda persona. El lector debe sentir que ha entrado en un artículo, no en un anuncio.

**DESARROLLO:**

*El punto de partida:* la cifra o el patrón que motivó la investigación.
*Las explicaciones fáciles:* enumera las causas que todo el mundo da por buenas y descarta cada una con evidencia. Este descarte es lo que hace creíble el hallazgo.
*Las fuentes:* qué dicen quienes trabajan dentro del sector, incluida la contradicción entre el discurso público y la práctica.
*El hallazgo:* el mecanismo único del problema, presentado como conclusión de la investigación y no como opinión.
*Qué implica:* por qué esto explica los fracasos anteriores.
*La excepción:* quién sí lo está atacando y cómo — aquí entra el producto, tratado como un caso, no como un anunciante.

**TONO:** frío, preciso, sin adjetivos de venta. La fuerza está en los datos y en el orden en que se revelan. Nunca te dirijas al lector en segunda persona hasta el cierre.

**ESTILO:** nivel de lectura de 6.º a 8.º grado. Subtítulos que expongan hallazgos, no preguntas. Cifras y fechas concretas. **Negrita** solo en los datos que sostienen el hallazgo. Cierre sobrio con la llamada a la acción claramente separada del cuerpo del reportaje y marcada como información comercial.`,

  "advertorial-comparison": `Escribe un publirreportaje con formato de **comparativa contra la alternativa obvia**. El narrador usó durante años exactamente lo que el lector usa ahora.

**APERTURA:** nombra la alternativa que el lector ya usa y reconoce por qué tiene sentido usarla. Nunca la ridiculices: si el lector se siente estúpido por su elección, deja de leer.

**DESARROLLO:**

*Lo que la alternativa sí hace bien:* concédelo de forma explícita y concreta. Esto compra la credibilidad para todo lo que viene después.
*Dónde se queda corta:* el momento exacto en que el narrador notó el límite. Situación cotidiana y reconocible, no un fallo catastrófico.
*Por qué se queda corta:* aquí entra el mecanismo único del problema. La clave es que la alternativa **no podía** funcionar, por cómo está construida, no porque sea mala.
*Qué hace distinto el producto:* el mecanismo único de solución, contrapuesto punto por punto al anterior.
*La comparación honesta:* incluye al menos un aspecto en el que la alternativa siga siendo mejor. Sin esto el texto se lee como publicidad y pierde toda la fuerza.

**REGLA CRÍTICA:** el argumento es mecánico, no valorativo. Se trata de explicar por qué una cosa no puede resolver el problema y la otra sí, no de decir cuál es mejor.

**ESTILO:** frases cortas, nivel de 5.º grado, párrafos de 1 a 3 frases. **Negrita** en las diferencias mecánicas y en los datos. Cierre con llamada a la acción y garantía.`,
};

export function buildAdvertorialPrompt(options: {
  product: Product;
  research: ProductResearch;
  store?: Store | null;
  marketContext: MarketContext;
  offers?: ProductOffers | null;
  notes?: ProductNote[];
  /** Copys ya probados, como referencia de patrón. */
  swipe?: string;
  method: CopyMethod;
  awarenessLevel: AwarenessLevel;
  desire: string;
  angle?: MarketingAngle;
}): string {
  const { product, research, store, method, awarenessLevel, desire, angle } = options;

  const framework = ADVERTORIAL_FRAMEWORKS[method.id];
  if (!framework) {
    throw new Error(`No hay marco definido para el método "${method.id}".`);
  }

  const source = angle
    ? `## Ángulo sobre el que se construye

**${angle.name}**

- Público: ${angle.targetAudience}
- Arco: ${angle.storyArc.start} → ${angle.storyArc.crisis} → ${angle.storyArc.discovery} → ${angle.storyArc.resolution}
- Mecanismo único del problema (UMP): ${angle.problemMechanism}
- Mecanismo único de solución (UMS): ${angle.solutionMechanism}
- Momento emotivo clave: ${angle.emotionalMoment}

Deseo masivo de fondo: **${desire}**`
    : `## Deseo masivo sobre el que se construye

**${desire}**

No hay ángulo definido. Deduce el mecanismo único del problema y el de la solución de la investigación anterior, y hazlos explícitos en el texto.`;

  return `${buildProductContext(product, research, store, options.marketContext, {
    offers: options.offers,
    notes: options.notes,
    swipe: options.swipe,
  })}

${source}

## Nivel de conciencia

Escribe para un público **${AWARENESS_LABELS[awarenessLevel].toLowerCase()}**.

## Tarea

${framework}

${lengthBrief(method.wordRange)}

Nivel de lectura: ${method.readingLevel}.

Escribe en ${product.language}.
${FACEBOOK_OUTPUT_BLOCK}`;
}

/* --------------------------- Búsqueda de competidores -------------------------- */

/**
 * Cuando el usuario no aporta URLs de competidores, el prompt 2 no puede
 * arrancar. Esta llamada las encuentra antes, con búsqueda web, y se las
 * presenta para que confirme: la investigación no empieza sobre datos que nadie
 * ha validado.
 */
export function buildCompetitorSearchPrompt(
  product: Product,
  marketContext: MarketContext,
): string {
  const niche = product.researchInputs?.niche || product.category;

  /*
   * Sin precio de referencia se busca igual, solo que sin acotar por gama.
   *
   * En general no hay uno: dar el de un país haría buscar competidores de un
   * mercado con el listón de precios de otro, y en países con poder adquisitivo
   * distinto eso devuelve la competencia equivocada.
   */
  const priceText = priceLine(
    "Precio de referencia",
    marketContext.price,
    marketContext.market?.currency ?? "",
  );

  return `Busca marcas competidoras reales del siguiente producto.

Producto: ${product.name}
Categoría: ${product.category}
Nicho: ${niche}
${marketLines(marketContext.market, product.language)[0]}
Descripción: ${product.description}${priceText ? `\n${priceText}` : ""}

Busca específicamente marcas **DTC** que vendan principalmente online mediante comercio electrónico, Shopify o embudos de respuesta directa. No incluyas marketplaces, distribuidores, grandes superficies ni marcas que solo vendan en retail físico.

Para cada competidor devuelve:

- Nombre de la marca
- URL de la tienda o de la página del producto competidor
- Una frase explicando por qué compite con este producto
- Rango de precio observado, si está disponible
- Un nivel de confianza: alta si has verificado la web, media si la has inferido de fuentes secundarias

Devuelve entre 3 y 6 competidores, ordenados del más directo al menos directo. Si no encuentras ninguno que cumpla los criterios, dilo claramente en lugar de rellenar con marcas que no encajan.

Responde en ${product.language}.`;
}
