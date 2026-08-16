import type { Product } from "@/types";
import { priceLine } from "@/lib/market-price";
import type { MarketContext } from "@/lib/market-selection";
import type { ProductResearch, ResearchDocumentId } from "@/types/research";
import { RESEARCH_DOCUMENT_META } from "@/types/research";
import type { Store } from "@/types/store";
import { describeOffers, type ProductOffers } from "@/types/offer";
import { describeNotes, type ProductNote } from "@/types/note";

/**
 * Los seis prompts de investigación, fieles a `prompts6.md`.
 *
 * Tres decisiones que conviene tener presentes:
 *
 * 1. **La demografía es opcional.** El documento lo dice literalmente en su
 *    apartado 5: «Composición demográfica y de la audiencia (obligatoria o
 *    generada automáticamente) — Si no se proporcionan datos demográficos,
 *    genere automáticamente estimaciones de estilo SimilarWeb». Es decir, el
 *    reparto por edad y género es una **salida** del documento 1, no un dato
 *    que haya que traer de casa. Solo el prompt 3 lo pide como entrada, y para
 *    entonces el documento 1 ya lo ha calculado.
 *
 * 2. **Los documentos 4 y 6 llevan adjuntos.** El original dice «ADJUNTAR
 *    DOCUMENTO...» porque su autor trabajaba subiendo PDFs a un chat. Aquí los
 *    adjuntos se sustituyen por el JSON de los documentos previos, que es lo
 *    mismo pero sin pérdidas y sin pasar por un PDF.
 *
 * 3. **Estos prompts piden solo el informe.** El JSON que alimenta el panel lo
 *    produce una segunda llamada, con `output_config.format`, que lee el
 *    informe ya escrito (ver `research-schemas.ts`).
 *
 *    La primera versión pedía las dos cosas de golpe y se rompió en la primera
 *    prueba real: el documento 2 hizo 26 búsquedas, escribió 65.000 caracteres
 *    y se cortó por longitud justo antes del JSON. Dos dólares por un documento
 *    ilegible. Lo que la plataforma necesita no puede depender de que quepa
 *    después de un informe de longitud imprevisible.
 */

/* ------------------------------ Contexto común --------------------------------- */

export interface ResearchExtras {
  offers?: ProductOffers | null;
  notes?: ProductNote[];
  currency?: string;
  /*
   * El mercado, obligatorio y sin valor por defecto: es el único campo sin `?`,
   * así que el compilador obliga a pasarlo en todos los llamantes.
   *
   * Ojo con lo que se meta aquí: esto viaja dentro del **encargo**, que es el
   * primer bloque y el que lleva la marca de caché (`research-runner.ts`). Tiene
   * que ser idéntico entre las vueltas de una misma investigación, o la caché
   * deja de acertar y se vuelve a pagar el contexto entero en cada búsqueda.
   */
  marketContext: MarketContext;
}

function productLine(product: Product, store: Store | null | undefined, extras: ResearchExtras): string {
  const offerBlock = extras?.offers
    ? describeOffers(extras.offers, extras.currency ?? "EUR")
    : "";
  const notesBlock = describeNotes(extras?.notes ?? []);

  const market = extras.marketContext.market;

  const parts = [
    `Producto: ${product.name}`,
    product.researchInputs?.niche ? `Nicho: ${product.researchInputs.niche}` : "",
    market
      ? `País objetivo: ${market.countryName}`
      : // En general no hay país que investigar, y callarlo no basta: el modelo
        // elegiría uno y devolvería un informe de mercado sobre un país que
        // nadie pidió, con la misma cara que si fuera el correcto.
        "País objetivo: varios (no supongas ninguno; lo que digas tiene que valer para todos)",
    // El idioma del cliente, para saber en qué se le habla. No es el idioma en
    // que se escribe este informe: eso lo fija LANGUAGE_RULE.
    `Idioma del cliente (para los anuncios, no para este informe): ${market?.languageName ?? product.language}`,
    // Vacía en general: investigar con el precio de otro país devuelve la
    // competencia equivocada en un mercado con otro poder adquisitivo.
    priceLine("Precio de venta", extras.marketContext.price, market?.currency ?? ""),
    product.description ? `Descripción: ${product.description}` : "",
    store ? `Tienda: ${store.brand} (${store.domain})` : "",
    offerBlock ? `\n${offerBlock}` : "",
    notesBlock ? `\n${notesBlock}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Un rango de edad tiene que llevar algún número.
 *
 * El formulario obligaba antes a rellenarlo, así que hay fichas guardadas con
 * cosas como «no lo se». Meterlas en el prompt como si fueran un dato es peor
 * que no tener nada: el modelo intentaría dirigirse a esa franja.
 */
function usableAgeRange(value: string | undefined): string {
  const text = value?.trim() ?? "";
  return /\d/.test(text) ? text : "";
}

/**
 * Bloque de demografía del prompt 1.
 *
 * Si el usuario indicó edad o géneros, se pasan como acotación. Si no, se cita
 * la propia instrucción del documento para que el modelo las estime, en vez de
 * bloquear el alta del producto pidiéndoselas a quien todavía no las sabe.
 */
function demographicBlock(product: Product): string {
  const age = usableAgeRange(product.researchInputs?.targetAgeRange);
  const genders = product.researchInputs?.targetGenders ?? [];
  const audience = product.targetAudience?.trim();

  const supplied = [
    age ? `Rango de edad al que quiero dirigirme: ${age}` : "",
    genders.length > 0 ? `Géneros a los que quiero dirigirme: ${genders.join(", ")}` : "",
    audience ? `Público objetivo tal y como lo describo yo: ${audience}` : "",
  ].filter(Boolean);

  if (supplied.length === 0) {
    return `No te doy datos demográficos. Según el apartado 5 de este encargo, genera automáticamente estimaciones de estilo SimilarWeb usando Statista, SimilarWeb, Google Trends o categorías adyacentes, y dime en qué te has basado.`;
  }

  return `${supplied.join("\n")}

Estos datos son una acotación mía, no una restricción: si la investigación indica que el mercado real está en otra franja de edad o en otro género, dilo explícitamente y da tu estimación junto a la mía.`;
}

/* ------------------------- 1 · Investigación de concienciación ------------------ */

export function buildAwarenessPrompt(
  product: Product,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  return `Eres un estratega de investigación de mercados formado en "Breakthrough Advertising" de Eugene Schwartz.

Tu tarea es llevar a cabo un análisis integral de conocimiento del mercado e inteligencia demográfica para este producto:

${productLine(product, store, extras)}

El objetivo es determinar:
- La etapa dominante de conciencia del consumidor según el marco de Schwartz.
- El mercado total direccionable (TAM) y su potencial de crecimiento.
- La composición demográfica (género, edad, geografía, ingresos).
- Los tres avatares demográficos de mayor valor para segmentar anuncios.

La salida alimentará directamente tanto la estrategia de respuesta directa como el desarrollo creativo.

## 1. Objetivo

Identifica el nivel de conocimiento del mercado, sus creencias clave, el tamaño del TAM y su composición demográfica, para señalar dónde debe empezar la estrategia publicitaria.

## 2. Definiciones de conciencia (de Breakthrough Advertising)

- **Inconsciente**: no reconoce que tiene un problema o una necesidad.
- **Consciente del problema**: sabe que tiene un problema, pero no que existe solución.
- **Consciente de la solución**: conoce categorías de producto que lo resuelven, pero no el nuestro.
- **Consciente del producto**: conoce nuestro producto, pero no está convencido de que sea la mejor opción.
- **El más consciente**: conoce y quiere nuestro producto, solo necesita una oferta.

## 3. Fuentes de evidencia

Extrae evidencia de:
- Redes sociales (Reddit, TikTok, YouTube, Facebook, X)
- Datos de búsqueda (Google Trends, Ahrefs, SEMrush)
- Informes de mercado (Statista, Grand View Research, IBISWorld)
- Sitios de la competencia, reseñas y mensajes publicitarios
- Análisis de audiencia (SimilarWeb, Meta Audience Insights, datos de Amazon)

## 4. Requisitos de salida

**A. Mercado total direccionable (TAM)**
Estima el tamaño total del mercado en USD y la base de usuarios. Incluye al menos dos fuentes. Menciona el CAGR o la dirección de la tendencia. Interpreta qué significa como oportunidad.

**B. Desglose por etapa de conciencia**
Estima la distribución porcentual entre inconsciente, consciente del problema, consciente de la solución, consciente del producto y el más consciente. Para cada una describe por qué entra en esa categoría (comportamiento, lenguaje, datos), frases de búsqueda o discusiones reales de ejemplo, y sus canales o puntos de contacto principales.

**C. Indicadores conductuales y lingüísticos**
Enumera ejemplos realistas de lo que dice o busca la gente en cada etapa.

**D. Tendencias de concienciación**
Señala cambios o señales nuevas (por ejemplo, intención de búsqueda creciente o cobertura de personas influyentes).

**E. Determinación final**
"La mayoría del mercado se encuentra actualmente en la etapa [X] de conocimiento". Apóyalo con 2-3 frases de razonamiento.

**F. Implicaciones publicitarias**
¿A qué nivel de concienciación hay que apuntar primero? ¿Qué tono, prueba y nivel emocional se necesitan? Da un ángulo de anuncio o tema de titular de ejemplo.

## 5. Composición demográfica y de audiencia

${demographicBlock(product)}

Entrega:
- **Desglose por género (%)**: mujeres [X]%, hombres [X]%.
- **Desglose por edad (%)**: 18-24, 25-34, 35-44, 45-54, 55-64, 65+, cada uno con su porcentaje estimado y una nota de comportamiento de compra.
- **Notas geográficas y de ingresos**: regiones con mejor desempeño y niveles de ingresos.
- **Cuadro demográfico resumen**: segmento | % del mercado | rasgos | implicación estratégica.

## 6. Los 3 mejores avatares recomendados

Cada avatar debe incluir nombre o etiqueta; edad, género, ingresos y contexto psicográfico; etapa principal de concienciación; plataformas que usa; y el mensaje que más le resuena, con su ángulo.

## 7. Resumen "para dummies" (referencia interna)

Al final del informe, escribe un resumen ejecutivo sencillo pensado para decidir, no para alimentar a un modelo. Incluye el nivel de conciencia dominante, qué significa eso en términos sencillos, la conclusión práctica sobre qué hacer a continuación con los mensajes, y cómo se relaciona ese nivel con los 3 avatares principales.

## 8. Tono y formato

Informe estructurado, basado en datos y práctico. Sin relleno.

## 9. Lista de verificación de entregables

TAM con fuentes · desglose por etapa · ejemplos conductuales y lingüísticos · tendencias · conclusión final · implicación publicitaria · desglose demográfico · cuadro resumen · 3 avatares · resumen para dummies.

Comienza el informe completo.${LANGUAGE_RULE}${REPORT_ONLY}`;
}

/* ------------------------ 2 · Investigación de la competencia ------------------- */

export function buildCompetitorsPrompt(
  product: Product,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  const urls = product.researchInputs?.competitorUrls ?? [];
  const niche = product.researchInputs?.niche || product.category;

  const seed =
    urls.length > 0
      ? `Para empezar, estos son mis competidores de referencia en el espacio:
${urls.map((url) => `- ${url}`).join("\n")}`
      : `No tengo competidores de referencia todavía. Empieza por identificar tú las marcas DTC que dominan este espacio en ${product.country} y dime por qué has elegido cada una antes de analizarlas.`;

  return `Tu tarea es realizar una investigación de la competencia para un producto en el espacio de ${niche}. El producto específico es ${product.name} y nos centramos en los competidores de ${product.country}.

${productLine(product, store, extras)}

Buscamos específicamente **marcas DTC** que vendan principalmente en línea a través de comercio electrónico, con embudos de Shopify o de respuesta directa.

${seed}

Por cada competidor que encuentres, quiero entender:

1. ¿A qué grupo objetivo se dirigen?
2. ¿Cuáles son sus principales embudos de adquisición de nuevos clientes?
3. ¿Cuál es el mensaje principal que transmiten en sus anuncios, publirreportajes y demás recursos publicitarios?
4. ¿Cuáles son algunos ejemplos de sus anuncios o de sus páginas de destino, si están disponibles?
5. ¿A qué niveles de concienciación apuntan sus materiales de marketing?
6. ¿Hay algún gancho, ángulo o gran idea que se repita constantemente en sus recursos publicitarios?
7. ¿Existen brechas importantes —en ángulos, en niveles de concienciación o en cualquier otra cosa— que veas como una oportunidad que podamos aprovechar?
8. ¿Cuál es su estructura de precios?

Para **cada escalón** anota, sin mezclarlos:

- \`units\`: cuántas unidades incluye (1 botella, 2 botellas, 3 botellas...).
- \`unitPrice\`: lo que cuesta **una** unidad en ese escalón. Es el número grande que suele enseñar la página: «$59.50 por botella».
- \`price\`: lo que se paga **en total** por ese escalón. Si la página solo enseña el precio por unidad, multiplícalo por las unidades y dilo en la nota.
- \`compareAtPrice\`: el precio tachado, si lo hay.
- \`currency\`: el código ISO de la moneda tal y como aparece en su web (USD, EUR, MXN, GBP...).

**No confundas el precio por unidad con el total.** Es el error más fácil de cometer en estas páginas —enseñan «$53.00 per bottle» en grande dentro de un pack de 3— y hace que la comparación de precios sea falsa mientras parece correcta.

**No conviertas de moneda.** Un precio convertido con un tipo de cambio inventado parece exacto y no lo es, y después se compara contra el nuestro como si fueran la misma.
9. ¿Qué les gusta y qué no les gusta a sus clientes? Usa reseñas, señales sociales y redes para responder.
10. Si está disponible, ¿cuáles son sus ingresos estimados del negocio y los de su producto estrella más parecido al mío?

${LANGUAGE_RULE}${REPORT_ONLY}`;
}

/* --------------------------- 3 · Investigación de avatares ---------------------- */

export function buildAvatarsPrompt(
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  /*
   * La demografía sale del documento 1 si ya está hecho.
   *
   * Es el orden natural: el 1 calcula el reparto por edad y género, el 3 lo
   * usa para saber a quién escuchar. Solo se pregunta al usuario cuando el 1
   * todavía no existe.
   */
  const awareness = research.awareness;
  const fromDocument1 = awareness
    ? `Según el documento 1 de concienciación, este mercado es ${awareness.demographics.gender.female}% mujeres y ${awareness.demographics.gender.male}% hombres, concentrado en ${awareness.demographics.ageBrackets
        .slice()
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 2)
        .map((bracket) => bracket.range)
        .join(" y ")} años.`
    : "";

  const usableAge = usableAgeRange(product.researchInputs?.targetAgeRange);
  const declared = [
    usableAge ? `edades ${usableAge}` : "",
    (product.researchInputs?.targetGenders ?? []).length > 0
      ? (product.researchInputs?.targetGenders ?? []).join(" y ")
      : "",
  ].filter(Boolean);

  const audience =
    fromDocument1 ||
    (declared.length > 0
      ? `Me dirijo a ${declared.join(", ")}.`
      : `Todavía no tengo el desglose demográfico. Dedúcelo de la categoría y del país, y dime en qué te basas.`);

  return `Voy a crear anuncios y publirreportajes de respuesta directa en Facebook para este producto:

${productLine(product, store, extras)}

${audience}

Me gustaría tu ayuda para realizar una **investigación psicográfica**. El objetivo es comprender a fondo su estado emocional interno, sus patrones de lenguaje, sus luchas y puntos débiles, sus creencias y las palabras o frases concretas que usan para describir sus problemas y su situación de vida.

A continuación te doy una serie de preguntas que necesito que respondas mediante investigación exhaustiva. **Aporta citas textuales** de personas de este grupo demográfico, consultando publicaciones en foros, comentarios, redes sociales y reseñas. Para hacer una investigación de avatares eficaz necesitamos ver lo que dicen nuestros clientes, lo que creen y cómo piensan, en sus propias palabras.

## Perspectivas sobre la demografía

- ¿Quién es el cliente?
- ¿Qué actitudes tiene (religiosas, políticas, sociales, económicas)?
- ¿Cuáles son sus esperanzas y sueños?
- ¿Cuáles son sus victorias y sus fracasos?
- ¿Qué fuerzas externas cree que le han impedido tener una vida mejor?
- ¿Cuáles son sus prejuicios?
- Resume sus creencias fundamentales sobre la vida, el amor y la familia en 1 a 3 frases.

## Otras soluciones existentes

- ¿Qué está usando ya el mercado? Enuméralo.
- ¿Cómo ha sido su experiencia?
- ¿Qué le gusta de las soluciones existentes?
- ¿Qué no le gusta?
- ¿Cuáles son sus historias de terror con esas soluciones?
- ¿Cree el mercado que la solución existente funciona? Si no, ¿por qué?

## Curiosidad

- ¿Alguien ha intentado resolver los problemas de este mercado de una forma única? ¿Con qué resultado?
- ¿Existe una historia conspirativa detrás de por qué las viejas soluciones no funcionaron?
- ¿Hay intentos más antiguos de resolver el problema (anteriores a 1960) que sean singulares? ¿Qué pasó: tuvieron éxito y se olvidaron, o fracasaron, y por qué?

Ejemplos de lo que busco en este apartado: Nikola Tesla en el ámbito energético, cuyas soluciones no aceptaron las grandes eléctricas y quedaron relegadas al olvido. O el ácido undecilénico, con el que el ejército de EE. UU. resolvió los hongos en los pies durante la Segunda Guerra Mundial y cuya eficacia hoy se ha olvidado.

## Corrupción

- ¿Existe la creencia de que estos puntos débiles no existían o no eran tan graves antes?
- ¿Existe la creencia de que algo los ha agravado recientemente? Si es así, ¿qué fuerzas son y por qué están ahí?

${LANGUAGE_RULE}${REPORT_ONLY}`;
}

/* --------------------------- 4 · Investigación maestra -------------------------- */

export function buildMasterPrompt(
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  const niche = product.researchInputs?.niche || product.category;
  const levels = research.awareness
    ? [research.awareness.dominantLevel, research.awareness.advertisingImplications.targetLevel]
    : [];

  const focus =
    levels.length > 0
      ? `Céntrate en las personas que caen en los segmentos ${[...new Set(levels)].join(" y ")}.`
      : "Céntrate en los segmentos de conciencia que el documento 1 señale como dominante y como objetivo.";

  return `Estoy creando anuncios y publirreportajes de Facebook en el nicho de ${niche}. El producto es ${product.name} y apuntamos a ${product.country}.

${productLine(product, store, extras)}

Ya he realizado investigación profunda sobre conocimiento del mercado, competidores y avatar psicográfico. Te la paso a continuación en JSON en lugar de como PDF adjunto, para que no se pierda nada por el camino:

### Documento 1 · Concienciación
\`\`\`json
${JSON.stringify(research.awareness, null, 2)}
\`\`\`

### Documento 2 · Competencia
\`\`\`json
${JSON.stringify(research.competitors, null, 2)}
\`\`\`

### Documento 3 · Avatares
\`\`\`json
${JSON.stringify(research.avatars, null, 2)}
\`\`\`

**Tu tarea**: revisar esta investigación en detalle para crear UN documento maestro que contenga TODA la información más importante que haría falta para vender este producto con anuncios de Facebook.

Este documento se usará para dar contexto a los modelos que redacten textos de venta de respuesta directa, publirreportajes y guiones publicitarios. Su propósito es no tener que cargar los tres documentos originales cada vez que queramos crear material nuevo. Imagina que es un documento que se va a usar a perpetuidad.

No busco información sobre tamaño de mercado ni tácticas concretas. Lo que busco es:

**1. Descripción demográfica del mercado objetivo.** ${focus}

**2. Descripción psicográfica del mercado objetivo.**
- ¿Cuáles son sus problemas y puntos débiles? ¿Cómo los describen CON SUS PROPIAS palabras?
- ¿Cuáles son sus esperanzas y sueños? En concreto: ¿cómo es su estado futuro ideal con el problema resuelto? ¿Qué aspecto tendría, cómo se verían y se sentirían? Cuando imaginan ese futuro, ¿qué más es cierto sobre su vida en ese momento? También con sus propias palabras.
- ¿Cómo se ven a sí mismos en general, qué lenguaje deberíamos usar al hablarles y qué lenguaje deberíamos evitar?
- ¿Cuáles son las principales promesas que podemos hacerles y que querrían oír?

**3. ¿Cuáles serán sus mayores objeciones** a nuestras campañas y cómo las abordamos?

**4. ¿Qué soluciones existentes** se han probado ya en el mercado y por qué no bastan?

${LANGUAGE_RULE}${REPORT_ONLY}`;
}

/* --------------------------- 5 · Extracción del deseo --------------------------- */

export function buildDesireExtractionPrompt(
  product: Product,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  const competitorUrl = product.researchInputs?.competitorUrls?.[0];
  const amazonUrl = product.researchInputs?.amazonUrl;

  const sources = [
    competitorUrl ? `Enlace de mi principal competidor: ${competitorUrl}` : "",
    amazonUrl ? `Enlace de Amazon de mi producto o de uno similar: ${amazonUrl}` : "",
  ].filter(Boolean);

  return `Quiero que analices este producto utilizando el marco de actuaciones y deseos de masas de Eugene Schwartz.

${productLine(product, store, extras)}

${
  sources.length > 0
    ? `Como no tengo el producto delante, te doy las fuentes de las que extraer sus actuaciones:
${sources.join("\n")}`
    : "No tengo enlaces de referencia, así que trabaja a partir de la descripción del producto y de lo que sepas de la categoría, y señala qué actuaciones son deducción tuya."
}

Sigue estos pasos cuidadosamente y en orden:

1. Enumera **todas las actuaciones directas**: las acciones físicas y funcionales que realiza el producto.

2. Enumera **todas las actuaciones secundarias o consecuentes**: lo que sucede como resultado de esas acciones directas (por ejemplo, alineación de la columna → menos ronquidos; mejor sueño → más energía; comodidad → mejor estado de ánimo). No omitas ni pases por alto estos resultados secundarios.

3. Para cada actuación, **asígnale el deseo humano de masas** que satisface: salud, alivio del dolor, belleza, confianza, reconocimiento, relaciones, ahorro de dinero, libertad, comodidad, etc.

4. **Califica cada deseo** con las tres dimensiones de Schwartz:
   - **Urgencia**: ¿es un dolor inmediato y apremiante o de baja prioridad?
   - **Poder de permanencia**: ¿se repite a diario o crónicamente, o es temporal?
   - **Alcance**: ¿cuánta gente comparte este deseo (nicho o mercado masivo)?

5. A partir de esa evaluación, identifica **la única actuación dominante + deseo** con mayor poder de venta: la que suma más urgencia, permanencia y alcance.

6. Muestra cómo **todas las demás actuaciones** pueden usarse como prueba de apoyo o refuerzo de esa actuación dominante.

7. Crea **3 titulares de ejemplo** basados en la actuación dominante: uno para mercado consciente del problema, uno para mercado consciente de la solución y uno para mercado consciente del producto.

8. Por último, expresa todos los deseos como **declaraciones de "Quiero"**, para poder verlos desde el punto de vista del cliente.

${LANGUAGE_RULE}${REPORT_ONLY}`;
}

/* --------------------------- 6 · Validación del deseo --------------------------- */

export function buildDesireValidationPrompt(
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  const niche = product.researchInputs?.niche || product.category;

  return `Estoy haciendo investigación profunda sobre deseos de masas y validándolos en el mercado para un producto en el espacio de ${niche}. El producto específico es ${product.name}.

${productLine(product, store, extras)}

Quiero que profundicemos para entender cuáles de los deseos de masas candidatos son realmente los que sostienen el mercado en ${product.country}, y cómo de fuertes son comparados entre sí.

Acabo de usar un modelo para extraer los deseos de masas de mi producto. Este es su resultado, en JSON en lugar de como PDF adjunto:

\`\`\`json
${JSON.stringify(research.desireExtraction, null, 2)}
\`\`\`

Sigue estos pasos cuidadosamente y en orden:

1. **Replantea** los deseos de masas candidatos claramente, como declaraciones breves.

2. Para cada deseo, **investiga la evidencia en el lenguaje real del cliente**:
   - Consulta reseñas de Amazon, hilos de Reddit, foros públicos, respuestas de Quora, comentarios de YouTube y discusiones en redes relacionadas con el problema o la categoría.
   - Extrae **citas textuales**, historias o quejas que revelen dolor emocional, frustración o urgencia ligados a ese deseo.
   - Resume con tus palabras los desencadenantes emocionales clave que expresan.

3. **Mapea cada deseo con las tres dimensiones de Schwartz** usando la investigación:
   - **Urgencia**: por el lenguaje que usan, ¿con qué urgencia quieren que se resuelva?
   - **Poder de permanencia**: ¿se repite a diario o crónicamente, o se desvanece?
   - **Alcance**: ¿cuánta gente parece compartirlo (amplio o de nicho)?

   Puntúa cada dimensión del 1 al 5, **con su razonamiento**.

4. **Clasifica los deseos** del más fuerte al más débil, según la puntuación total y la intensidad emocional de la evidencia.

5. **Resalta las implicaciones publicitarias**: para los 2 o 3 deseos principales, explica por qué son los más escalables para publicidad y cómo se pueden dramatizar (elementos visuales, emociones, historias).

6. **Nota sobre los deseos de apoyo**: muestra cómo los deseos peor clasificados pueden reforzar o solaparse con los dominantes en la creatividad.

Al final, de entre los deseos de masas que te he dado, **clasifica y elige los 5 más importantes** en los que deberíamos centrar la campaña: los 5 con mayor probabilidad de éxito según la investigación. Exprésalos como declaraciones de deseo y elígelos de la lista que te he pasado.

${LANGUAGE_RULE}${REPORT_ONLY}`;
}

/* ------------------------------ Cierre del informe ------------------------------ */

/**
 * Lo que se añade al final de cada prompt.
 *
 * Deja explícito que el informe es lo único que se pide. Sin esto el modelo
 * tiende a cerrar con un resumen en JSON por su cuenta, que no sirve —no sigue
 * el esquema— y alarga la respuesta justo donde puede cortarse.
 */
/**
 * El idioma en el que se escribe la investigación.
 *
 * **No es el idioma de la tienda, y la diferencia importa.** El copy se escribe
 * en el idioma del cliente —un anuncio para Estados Unidos va en inglés—, pero
 * la investigación la lees tú. Cuando el producto era de una tienda inglesa,
 * secciones enteras como «lo que les gusta y lo que no» llegaban en inglés y
 * había que traducirlas a mano para poder usarlas.
 *
 * Las citas textuales son la excepción: son la prueba. Cambiarlas de idioma
 * destruye justamente lo que las hace útiles —las palabras exactas del cliente,
 * que después se reutilizan en el anuncio—, así que van en su idioma original
 * con la traducción al lado.
 */
const READING_LANGUAGE = "español";

const LANGUAGE_RULE = `

## Idioma

Escribe **todo el informe en ${READING_LANGUAGE}**, sea cual sea el idioma de la tienda, del país objetivo o de las fuentes que consultes.

Única excepción: las **citas textuales de clientes** (reseñas, comentarios, mensajes de foro). Esas van en su idioma original y **con la traducción al ${READING_LANGUAGE} justo después, entre paréntesis**. Son la evidencia y también el material del que salen los anuncios: traducirlas sin más borraría las palabras exactas que hay que reutilizar.`;

const REPORT_ONLY = `

---

Devuelve **solo el informe en Markdown**. No añadas al final ningún bloque JSON, tabla de datos estructurados ni resumen en formato de máquina: eso se extrae después en un paso aparte. Concéntrate en que el informe sea completo y esté bien sustentado.`;

/* -------------------------------- El despachador -------------------------------- */

/** Devuelve el prompt de un documento, con sus dependencias ya incorporadas. */
export function buildResearchPrompt(
  id: ResearchDocumentId,
  product: Product,
  research: ProductResearch,
  store: Store | null | undefined,
  extras: ResearchExtras,
): string {
  switch (id) {
    case "awareness":
      return buildAwarenessPrompt(product, store, extras);
    case "competitors":
      return buildCompetitorsPrompt(product, store, extras);
    case "avatars":
      return buildAvatarsPrompt(product, research, store, extras);
    case "master":
      return buildMasterPrompt(product, research, store, extras);
    case "desire-extraction":
      return buildDesireExtractionPrompt(product, store, extras);
    case "desire-validation":
      return buildDesireValidationPrompt(product, research, store, extras);
    /*
     * Solo existen en el vertical de casino, donde los escribe
     * `buildCasinoResearchPrompt` antes de llegar aquí. El `case` está porque
     * TypeScript exige el `switch` exhaustivo, y devolver cadena vacía es lo
     * correcto: si alguien los pide en e-commerce, no hay encargo que escribir.
     */
    case "regulation":
    case "payments":
    case "casino-landscape":
      return "";
  }
}

/**
 * Orden de ejecución.
 *
 * Los documentos sin dependencias van juntos en la primera tanda; los que
 * dependen de otros esperan a que estén los suyos. Sale de `dependsOn`, así que
 * añadir una dependencia nueva reordena esto solo.
 */
export function researchWaves(): ResearchDocumentId[][] {
  const pending = Object.keys(RESEARCH_DOCUMENT_META) as ResearchDocumentId[];
  const done = new Set<ResearchDocumentId>();
  const waves: ResearchDocumentId[][] = [];

  while (done.size < pending.length) {
    const wave = pending.filter(
      (id) =>
        !done.has(id) && RESEARCH_DOCUMENT_META[id].dependsOn.every((need) => done.has(need)),
    );
    // Una dependencia circular dejaría la tanda vacía y colgaría el bucle.
    if (wave.length === 0) break;
    wave.forEach((id) => done.add(id));
    waves.push(wave.sort((a, b) => RESEARCH_DOCUMENT_META[a].order - RESEARCH_DOCUMENT_META[b].order));
  }

  return waves;
}

/** Qué le falta a un documento para poder generarse. */
export function blockedBy(
  id: ResearchDocumentId,
  research: ProductResearch,
): ResearchDocumentId[] {
  return RESEARCH_DOCUMENT_META[id].dependsOn.filter(
    (dependency) => !research.documents[dependency].generatedAt,
  );
}
