import type { Product } from "@/types";
import type { MarketContext } from "@/lib/market-selection";
import type { ProductResearch } from "@/types/research";
import type { GeneratedCopy, MarketingAngle } from "@/types/copy";
import type {
  AdVisualConcept,
  AdVisualPrompt,
  HiggsfieldModel,
  ProductImageBrief,
  ProductImagePattern,
} from "@/types/visuals";
import {
  BEAT_META,
  FORBIDDEN,
  buildBeatImagePrompt,
} from "@/lib/story-beats";
import {
  AD_VISUAL_CONCEPT_LABELS,
  HIGGSFIELD_MODELS,
  PRODUCT_IMAGE_PATTERN_META,
  findModel,
} from "@/types/visuals";

/**
 * Construcción de los prompts que se envían a Higgsfield.
 *
 * Dos decisiones automáticas por cada creatividad, ambas revisables a mano:
 *
 * 1. **Qué modelo.** Nano Banana Pro es la opción por defecto porque su fuerte
 *    es exactamente lo que rompe en los anuncios: texto legible dentro de la
 *    imagen y control de dónde va cada elemento. Solo se recomienda otro cuando
 *    hay una razón concreta, no por variar.
 *
 * 2. **Si hace falta la foto del producto como referencia.** Depende de si el
 *    producto sale reconocible: sin referencia, el modelo se inventa el envase,
 *    y un envase inventado en un anuncio de rendimiento es una devolución.
 */

const NANO_BANANA_PRO = "nano-banana-pro";

/* --------------------------- Selección de modelo ------------------------------- */

interface ModelRecommendation {
  model: HiggsfieldModel;
  reason: string;
}

/**
 * Elige el modelo ideal para un concepto concreto.
 *
 * Nano Banana Pro se lleva todo lo que lleva texto o exige composición precisa.
 * Soul entra cuando lo que manda es el realismo humano y la consistencia del
 * producto entre piezas. Los rápidos quedan para el volumen.
 */
export function recommendModel(concept: AdVisualConcept): ModelRecommendation {
  const nanoBananaPro = findModel(NANO_BANANA_PRO)!;
  const soul = findModel("soul-v2")!;

  switch (concept) {
    case "resena":
    case "comparativa":
    case "antes-despues":
    case "oferta":
      return {
        model: nanoBananaPro,
        reason:
          "Lleva texto que tiene que leerse (estrellas, etiquetas, precio) y una composición donde la posición de cada elemento importa. Es justo su punto fuerte.",
      };
    case "ugc":
      return {
        model: soul,
        reason:
          "El realismo humano y la consistencia del sujeto entre variaciones pesan más aquí que la precisión de composición.",
      };
    case "producto-en-contexto":
      return {
        model: nanoBananaPro,
        reason:
          "El producto debe quedar íntegro dentro de una escena real, y eso exige control de la posición y del recorte.",
      };
    case "detalle-producto":
      return {
        model: nanoBananaPro,
        reason: "Un macro fiel al envase real necesita adherencia estricta a la referencia.",
      };
    case "editorial":
      return {
        model: nanoBananaPro,
        reason:
          "La franja de titular lleva texto que tiene que leerse entero y quedar dentro de su barra, sin comerse la cara ni el producto. Es composición con texto, que es donde este modelo gana.",
      };
    case "gancho-visual":
    default:
      return {
        model: nanoBananaPro,
        reason:
          "La escena tiene que transmitir una idea concreta, no una estética genérica. La adherencia semántica es lo que lo consigue.",
      };
  }
}

/* --------------------- ¿Hace falta la foto real del producto? ------------------ */

interface ReferenceDecision {
  needed: boolean;
  reason: string;
}

/**
 * Se marca sola cuando el producto sale reconocible en la pieza, que es cuando
 * inventárselo tiene coste real. El usuario puede desmarcarla siempre.
 */
export function decideProductReference(concept: AdVisualConcept): ReferenceDecision {
  switch (concept) {
    case "producto-en-contexto":
    case "detalle-producto":
    case "oferta":
    case "comparativa":
      return {
        needed: true,
        reason:
          "El producto aparece en primer plano. Sin la foto real el modelo se inventa el envase y la creatividad deja de corresponderse con lo que recibe el cliente.",
      };
    case "resena":
    case "ugc":
      return {
        needed: true,
        reason:
          "El producto se ve en manos de una persona. Si no coincide con el real, la prueba social se vuelve en contra.",
      };
    case "antes-despues":
      return {
        needed: false,
        reason:
          "La pieza es sobre el resultado, no sobre el envase. Actívalo solo si quieres que el producto aparezca en un rincón del encuadre.",
      };
    case "gancho-visual":
    default:
      return {
        needed: false,
        reason:
          "Es una escena conceptual sin producto a la vista. Enviar la referencia aquí solo restringe al modelo sin ganar nada.",
      };
  }
}

/* -------------------- Prompts de creatividad para un copy ---------------------- */

/** Instrucciones por concepto, con la lógica de conversión incorporada. */
const CONCEPT_BRIEFS: Record<AdVisualConcept, (context: PromptContext) => string> = {
  "gancho-visual": (ctx) =>
    `Una sola escena que capture el momento exacto del que habla el anuncio: ${ctx.emotionalMoment}. Sin producto a la vista y sin texto. Fotografía documental, luz natural, sin pose. La imagen debe hacer que alguien que vive ese problema se detenga al reconocerse.`,
  "producto-en-contexto": (ctx) =>
    `${ctx.productName} en el entorno real donde se usa, con señales del día a día de ${ctx.audience}. El producto nítido y bien recortado, el fondo con profundidad de campo suave. Sin texto.`,
  resena: (ctx) =>
    `Composición vertical con ${ctx.productName} a un lado y, al otro, una tarjeta de reseña legible: cinco estrellas, un nombre de pila y una cita corta y creíble sobre ${ctx.benefit}. Tipografía limpia con contraste alto. El texto debe leerse sin ampliar la imagen.`,
  comparativa: (ctx) =>
    `Composición dividida en dos columnas con una línea vertical fina. Izquierda etiquetada como la alternativa habitual, derecha con ${ctx.productName}. Bajo cada columna, dos o tres puntos cortos y legibles que contrasten. Fondo neutro. El texto debe ser el elemento más legible de la imagen.`,
  "antes-despues": (ctx) =>
    `Dos encuadres idénticos, misma luz, mismo ángulo y mismo encuadre, separados por una línea fina y etiquetados "Antes" y "Después". La diferencia debe ser visible pero creíble: nada exagerado. Muestra el resultado de ${ctx.benefit}.`,
  ugc: (ctx) =>
    `Foto tipo móvil, sin producción: alguien de ${ctx.audience} sosteniendo ${ctx.productName} en su casa, luz de ventana, encuadre imperfecto y ligeramente descentrado. Debe parecer una foto que alguien manda a una amiga, no una campaña.`,
  "detalle-producto": (ctx) =>
    `Macro de ${ctx.productName} centrado en el detalle que sostiene la promesa: textura, acabado o mecanismo. Fondo desenfocado y neutro, luz lateral suave que marque el relieve. Sin texto.`,
  oferta: (ctx) =>
    `${ctx.productName} sobre fondo limpio con el precio y la garantía en tipografía grande y legible. Composición ordenada, mucho aire, jerarquía clara entre el precio y el resto. El precio es el elemento dominante.`,
  /*
   * El formato de portada, sin lo que lo hace ilegal.
   *
   * Lo que rinde de este formato es la **composición**: la franja de titular
   * arriba, la foto grande ocupando el resto, el recuadro circular de detalle.
   * Lo que hunde cuentas es otra cosa —logo de un medio real, un médico
   * inventado con tilde de verificado, «elimina la diabetes»— y va prohibido
   * aquí abajo porque el modelo lo añade solo si no se le dice: ha visto miles.
   */
  editorial: (ctx) =>
    `Composición de portada: una franja horizontal sólida en el borde superior reservada para un titular, y debajo una fotografía grande que ocupa el resto del encuadre, mostrando ${ctx.emotionalMoment} de forma reconocible para ${ctx.audience}. Opcionalmente, un recuadro circular pequeño en una esquina inferior con un detalle ampliado relacionado con ${ctx.benefit}. La foto debe ser real y sin pose, no ilustración. Prohibido: logotipos o nombres de medios de comunicación o cadenas de televisión, marcas de verificación, personas presentadas como médicos o especialistas, batas blancas, y cualquier texto que prometa curar, revertir o eliminar una enfermedad.`,
};

interface PromptContext {
  productName: string;
  audience: string;
  benefit: string;
  emotionalMoment: string;
}

/**
 * Genera las creatividades de un copy: al menos cinco, cada una con su concepto,
 * su modelo recomendado y su decisión sobre la imagen de referencia.
 */
export function buildAdVisualPrompts(options: {
  product: Product;
  research: ProductResearch;
  copy: GeneratedCopy;
  angle?: MarketingAngle;
  /** Mínimo de creatividades por copy. */
  minimum?: number;
}): AdVisualPrompt[] {
  const { product, research, copy, angle, minimum = 5 } = options;

  const context: PromptContext = {
    productName: product.name,
    audience: angle?.targetAudience || product.targetAudience || "el público objetivo",
    benefit:
      research.master?.psychographics.mainPromises[0] ??
      product.benefits[0] ??
      "el resultado principal",
    emotionalMoment: angle?.emotionalMoment ?? copy.driverLabel,
  };

  /**
   * Orden de conceptos. Los primeros son los que más rinden en frío; el resto
   * amplía la tanda cuando se piden más de cinco.
   */
  const order: AdVisualConcept[] = [
    "gancho-visual",
    "resena",
    "producto-en-contexto",
    "comparativa",
    "ugc",
    "antes-despues",
    "detalle-producto",
    "oferta",
  ];

  const createdAt = new Date().toISOString();

  /*
   * Si el copy tiene escenas sacadas de su propio texto, mandan ellas.
   *
   * Las plantillas —gancho, reseña, comparativa— sirven para un anuncio corto,
   * donde no hay historia de la que tirar. En un long copy son un desperdicio:
   * el texto ya contiene sus imágenes, y una plantilla produce la misma
   * creatividad para dos historias completamente distintas.
   */
  if (copy.storyBeats?.length) {
    return copy.storyBeats.map((beat, index) => {
      const meta = BEAT_META[beat.kind];
      const withProduct = meta.showsProduct;

      return {
        id: `${copy.id}-beat-${index + 1}`,
        productId: product.id,
        copyId: copy.id,
        // La escena se mapea al concepto más cercano para no romper lo que ya
        // lee este campo; el prompt de verdad viene de la escena.
        concept: withProduct ? "producto-en-contexto" : "gancho-visual",
        title: `${meta.label} · «${beat.quote.slice(0, 40)}${beat.quote.length > 40 ? "…" : ""}»`,
        prompt: buildBeatImagePrompt({
          beat,
          productName: product.name,
          audience: context.audience,
          withProduct,
          intensity: copy.beatsIntensity ?? "crudo",
        }),
        negativePrompt: FORBIDDEN,
        aspectRatio: meta.aspectRatio,
        // Soul para las escenas con personas —el realismo humano manda— y Nano
        // Banana Pro para objetos, documentos y diagramas, donde importa la
        // composición y la fidelidad al envase.
        recommendedModelId:
          beat.kind === "retrato" || beat.kind === "momento-cero"
            ? "soul-v2"
            : NANO_BANANA_PRO,
        modelReason:
          beat.kind === "retrato" || beat.kind === "momento-cero"
            ? "Hay una persona en la escena y lo que la hace creíble es el realismo humano, no la precisión de composición."
            : "Objeto, documento o diagrama: manda el control de la composición y del encuadre.",
        needsProductReference: withProduct,
        referenceReason: withProduct
          ? "El producto sale reconocible, así que necesita la foto real: sin referencia el modelo se inventa el envase."
          : "El producto no aparece en esta escena.",
        createdAt,
      } satisfies AdVisualPrompt;
    });
  }

  const concepts = order.slice(0, Math.max(minimum, 5));

  return concepts.map((concept, index) => {
    const { model, reason } = recommendModel(concept);
    const reference = decideProductReference(concept);

    const brief = CONCEPT_BRIEFS[concept](context);
    const aspectRatio = concept === "ugc" ? "9:16" : concept === "resena" ? "4:5" : "1:1";

    return {
      id: `${copy.id}-visual-${index + 1}`,
      productId: product.id,
      copyId: copy.id,
      concept,
      title: `${AD_VISUAL_CONCEPT_LABELS[concept]} · ${copy.driverLabel}`,
      prompt: [
        brief,
        "",
        `Contexto de la campaña: el anuncio habla de "${copy.driverLabel}" para un público ${context.audience}.`,
        angle
          ? `Mecanismo del problema que debe insinuar la imagen: ${angle.problemMechanism}`
          : "",
        `Titular del anuncio, por si conviene reflejarlo visualmente: "${copy.content.headline}"`,
        "",
        "Formato publicitario para Meta. Nada de marcas de agua, ni logotipos inventados, ni texto ilegible.",
      ]
        .filter(Boolean)
        .join("\n"),
      negativePrompt:
        "texto ilegible, marcas de agua, logotipos inventados, manos deformes, envases distintos al de referencia, estética de banco de imágenes",
      aspectRatio,
      recommendedModelId: model.id,
      modelReason: reason,
      needsProductReference: reference.needed,
      referenceReason: reference.reason,
      createdAt,
    } satisfies AdVisualPrompt;
  });
}

/* ---------------------- Prompts de imágenes de producto ------------------------ */

/**
 * Prompt de una imagen de producto.
 *
 * El packshot principal es el único que fuerza fondo transparente o blanco puro:
 * es la pieza que después viaja como referencia a todos los anuncios, y para
 * componerla encima de cualquier escena tiene que estar recortada limpia.
 */
export function buildProductImagePrompt(options: {
  product: Product;
  research: ProductResearch;
  pattern: ProductImagePattern;
  brief: ProductImageBrief;
  marketContext: MarketContext;
}): string {
  const { product, research, pattern, brief, marketContext } = options;
  const meta = PRODUCT_IMAGE_PATTERN_META[pattern];

  const audience = product.targetAudience || "su público objetivo";
  const benefit = research.master?.psychographics.mainPromises[0] ?? product.benefits[0] ?? "";
  const competitor = research.competitors?.competitors[0]?.name;

  const patternInstructions: Record<ProductImagePattern, string> = {
    "packshot-principal": `${product.name} solo, centrado, sobre **fondo transparente o blanco puro**. Recorte limpio con los bordes definidos, sin sombra proyectada o con una sombra de contacto mínima. Iluminación de estudio uniforme, sin reflejos que quemen la etiqueta. Esta imagen se va a componer después dentro de otras creatividades, así que el recorte es lo más importante.`,
    "packshot-angulo": `${product.name} en vista de tres cuartos sobre fondo neutro, con sombra suave de contacto. Debe transmitir volumen y tamaño real.`,
    "producto-en-uso": `Alguien de ${audience} usando ${product.name} en su entorno cotidiano. Luz natural, gesto no posado, el producto reconocible pero sin protagonizar el encuadre.`,
    "escala-en-mano": `${product.name} sostenido en una mano, con el fondo desenfocado, de forma que el tamaño real quede claro de un vistazo.`,
    "detalle-textura": `Macro de ${product.name}: textura, material o acabado. Luz lateral que marque el relieve, fondo neutro desenfocado.`,
    "composicion-ingredientes": `${product.name} rodeado de sus componentes principales${product.ingredients.length ? ` (${product.ingredients.slice(0, 4).join(", ")})` : ""}, dispuestos de forma ordenada y cada uno con una etiqueta corta y legible. Fondo claro y limpio.`,
    "resena-estrellas": `${product.name} junto a una tarjeta de reseña: cinco estrellas, un nombre de pila y una cita corta y creíble${benefit ? ` sobre ${benefit.toLowerCase()}` : ""}. Tipografía limpia, texto perfectamente legible.`,
    "comparativa-alternativa": `Composición en dos columnas separadas por una línea fina. A la izquierda${competitor ? `, la alternativa habitual del tipo de ${competitor}` : ", la alternativa habitual"}; a la derecha, ${product.name}. Dos o tres puntos cortos bajo cada columna. El texto debe ser el elemento más legible.`,
    "antes-despues": `Dos encuadres idénticos, con la misma luz y el mismo ángulo, etiquetados "Antes" y "Después". La diferencia debe verse pero mantenerse creíble.`,
    /*
     * En general la imagen se compone **con el hueco del precio, sin precio**.
     *
     * Es el caso donde más caro sale equivocarse: un número quemado dentro de un
     * PNG no se corrige cambiando un campo, hay que volver a generar la imagen y
     * pagarla otra vez. Y si se publica, es el precio de otro país en la página
     * de este.
     */
    "pack-oferta": marketContext.price
      ? `${product.name} en pack sobre fondo limpio, con el precio (${marketContext.price.amount} ${marketContext.market?.currency ?? ""}) en tipografía grande y jerarquía clara. Mucho aire alrededor.`
      : `${product.name} en pack sobre fondo limpio, con una zona despejada y amplia en la parte inferior donde después irá el precio. **No escribas ninguna cifra ni símbolo de moneda.** Mucho aire alrededor.`,
  };

  const lines = [
    patternInstructions[pattern],
    "",
    `Producto: ${product.name} — ${product.description}`,
    `Categoría: ${product.category}. Tono de marca: ${product.tone}.`,
  ];

  if (brief.backgroundStyle) lines.push(`Fondo y luz: ${brief.backgroundStyle}.`);
  if (brief.paletteNote) lines.push(`Paleta: ${brief.paletteNote}.`);
  if (brief.additionalInstructions) {
    lines.push("", `Indicaciones adicionales del usuario: ${brief.additionalInstructions}`);
  }
  if (brief.referenceUrls.length > 0) {
    lines.push(
      "",
      `Se adjuntan ${brief.referenceUrls.length} imágenes de referencia. Respeta la forma, el color y la etiqueta del producto tal y como aparecen en ellas.`,
    );
  }

  lines.push(
    "",
    meta.hasText
      ? "El texto de la imagen debe ser legible a tamaño de miniatura en el feed. Nada de texto decorativo ilegible."
      : "Sin texto en la imagen.",
    "Nada de marcas de agua ni logotipos inventados.",
  );

  return lines.join("\n");
}

/** Modelo recomendado para cada patrón de imagen de producto. */
export function recommendModelForPattern(pattern: ProductImagePattern): ModelRecommendation {
  const meta = PRODUCT_IMAGE_PATTERN_META[pattern];
  const nanoBananaPro = findModel(NANO_BANANA_PRO)!;
  const soul = findModel("soul-v2")!;

  if (meta.hasText) {
    return {
      model: nanoBananaPro,
      reason: "La pieza depende de que el texto se lea, y ahí es donde marca la diferencia.",
    };
  }

  if (pattern === "producto-en-uso" || pattern === "escala-en-mano") {
    return {
      model: soul,
      reason: "Hay una persona en el encuadre y el realismo humano pesa más que la composición.",
    };
  }

  return {
    model: nanoBananaPro,
    reason:
      pattern === "packshot-principal"
        ? "El recorte limpio sobre fondo transparente exige control preciso de los bordes."
        : "Fidelidad al producto real con control de la composición.",
  };
}

/** Modelos disponibles, para el selector manual. */
export function availableModels(): HiggsfieldModel[] {
  return HIGGSFIELD_MODELS;
}
