import type { ProductHook, ProductResearch } from "@/types/research";

/**
 * Investigación de ejemplo para el producto `own-1` (Revital Serum).
 *
 * Existe para poder construir y validar el panel sin gastar tokens. Tiene la
 * forma exacta que devolverá la API con structured output, así que cuando se
 * conecte el proveedor basta con sustituir el origen de los datos: ni el panel
 * ni los gráficos cambian.
 *
 * Solo se sirve a productos marcados como demo — un producto real sin clave de
 * API configurada muestra el estado vacío, nunca estos datos.
 */

export const DEMO_RESEARCH_PRODUCT_IDS = ["own-1"];

const generatedAt = "2026-07-20T09:00:00.000Z";

export const researchFixture: ProductResearch = {
  awareness: {
    tam: {
      marketSizeUsd: 4_800_000_000,
      userBase: 11_200_000,
      cagr: "7,4% anual hasta 2030",
      sources: [
        "Statista · Mercado europeo de cuidado facial premium 2025",
        "Grand View Research · Anti-aging skincare market outlook",
      ],
      interpretation:
        "La categoría crece por encima del cuidado facial general porque el consumidor migra de crema genérica a rutina con activos concretos. La oportunidad no está en crear la necesidad, sino en explicar por qué un activo concreto merece confianza.",
    },
    stageBreakdown: [
      {
        level: "unaware",
        percentage: 8,
        reasoning:
          "No relacionan la sensación de tirantez o la falta de luminosidad con la deshidratación cutánea. Compran por impulso en el lineal.",
        searchPhrases: ["crema para la cara", "mi piel se ve apagada"],
        channels: ["Retail físico", "TikTok orgánico"],
      },
      {
        level: "problem-aware",
        percentage: 27,
        reasoning:
          "Identifican el problema con sus palabras — sequedad, líneas finas, piel sin luz — pero no saben que existe una categoría de sueros con ácido hialurónico que lo resuelve.",
        searchPhrases: [
          "por qué mi piel está tan seca",
          "cómo quitar las líneas de expresión",
          "piel apagada qué hacer",
        ],
        channels: ["Búsqueda en Google", "Reddit r/SkincareAddiction", "YouTube"],
      },
      {
        level: "solution-aware",
        percentage: 41,
        reasoning:
          "Conocen la categoría de sueros y comparan activos. Preguntan por concentraciones, peso molecular y compatibilidad con piel sensible, pero no tienen marca de referencia.",
        searchPhrases: [
          "mejor serum ácido hialurónico",
          "vitamina E o niacinamida para piel seca",
          "serum hidratante piel sensible",
        ],
        channels: ["Meta Ads", "Comparativas en blogs", "Instagram de dermatólogos"],
      },
      {
        level: "product-aware",
        percentage: 17,
        reasoning:
          "Han visto la marca, normalmente en anuncios o recomendaciones, y dudan entre ella y dos competidores concretos. Buscan reseñas y antes/después.",
        searchPhrases: ["Revital Serum opiniones", "Revital Serum vs Hydra Boost"],
        channels: ["Búsqueda de marca", "Reseñas en la propia web", "Retargeting"],
      },
      {
        level: "most-aware",
        percentage: 7,
        reasoning:
          "Ya han comprado o están a un paso. Solo necesitan una razón para hacerlo ahora: un pack, una garantía o un envío gratuito.",
        searchPhrases: ["Revital Serum descuento", "código promocional Lumen Lab"],
        channels: ["Email", "Retargeting de carrito"],
      },
    ],
    behavioralIndicators: [
      {
        level: "problem-aware",
        examples: [
          "«Llevo meses con la piel tirante por mucha crema que me ponga»",
          "«Me miro en el espejo por la mañana y me veo sin luz»",
        ],
      },
      {
        level: "solution-aware",
        examples: [
          "«¿Alguien ha probado un serum de hialurónico que no deje la cara pegajosa?»",
          "«No sé si necesito hialurónico o niacinamida, me pierdo»",
        ],
      },
      {
        level: "product-aware",
        examples: ["«¿Merece la pena pagar 48 € por este o es marketing?»"],
      },
    ],
    trends: [
      "La búsqueda de «serum piel sensible» crece un 34% interanual: el consumidor ya no quiere solo eficacia, quiere eficacia sin reacción.",
      "El formato antes/después pierde credibilidad frente al vídeo de rutina real sin edición.",
      "Aumenta la desconfianza hacia las promesas de resultado en días concretos tras varias sanciones publicitarias en el sector.",
    ],
    dominantLevel: "solution-aware",
    dominantReasoning:
      "El 41% del mercado ya sabe que los sueros existen y está comparando activos y marcas, pero no ha elegido. Es el punto donde el mensaje tiene más margen: no hay que educar sobre el problema ni convencer de la categoría, hay que ganar la comparación.",
    advertisingImplications: {
      targetLevel: "solution-aware",
      tone: "Cálido y científico, en primera persona, sin tecnicismos gratuitos.",
      proof: "Composición visible, concentración explícita y testimonios de piel sensible.",
      emotionalLevel:
        "Medio-alto: el motor es el alivio de dejar de probar productos que no funcionan, no la aspiración estética.",
      exampleAngle:
        "«Si tu piel sigue tirante después de la crema, el problema no es la hidratación. Es dónde se queda.»",
    },
    demographics: {
      gender: { female: 82, male: 18 },
      ageBrackets: [
        { range: "18-24", percentage: 9, notes: "Descubrimiento en TikTok, baja intención de compra" },
        { range: "25-34", percentage: 24, notes: "Primera rutina estructurada, comparan mucho antes de comprar" },
        { range: "35-44", percentage: 29, notes: "Núcleo del mercado: gasto alto y foco en prevención" },
        { range: "45-54", percentage: 22, notes: "Máxima renta disponible, valoran evidencia y autoridad" },
        { range: "55-64", percentage: 11, notes: "Compradoras leales, motivadas por la experiencia" },
        { range: "65+", percentage: 5, notes: "Buscan simplicidad y relación calidad-precio" },
      ],
      geoAndIncome: [
        "Madrid, Barcelona y Valencia concentran el 46% de la facturación online de la categoría.",
        "Renta familiar predominante: 35.000-60.000 € anuales.",
        "El ticket medio sube un 18% en compradoras mayores de 40 años.",
      ],
      summary: [
        {
          segment: "Mujeres",
          marketShare: "80-85%",
          traits: "Decisoras de compra, alta exposición a contenido de skincare",
          strategicImplication: "Mensajes empáticos y tranquilizadores, no aspiracionales",
        },
        {
          segment: "Hombres",
          marketShare: "15-20%",
          traits: "Lógicos, orientados a resultado y simplicidad",
          strategicImplication: "Enfatizar evidencia, eficiencia y pocos pasos",
        },
        {
          segment: "35-44",
          marketShare: "25-30%",
          traits: "Profesionales preocupadas por la prevención",
          strategicImplication: "Enfoque en prevención y calidad de la formulación",
        },
        {
          segment: "45-54",
          marketShare: "20-25%",
          traits: "Gasto máximo y foco en salud de la piel",
          strategicImplication: "Autoridad, pruebas y afirmaciones sostenidas en el tiempo",
        },
      ],
    },
    avatars: [
      {
        name: "La comparadora informada",
        age: "32-42",
        gender: "Mujer",
        income: "40.000-65.000 €",
        psychographics:
          "Lee ingredientes antes de comprar, sigue a dermatólogos en Instagram y desconfía de las promesas rápidas.",
        awarenessStage: "solution-aware",
        platforms: ["Instagram", "Reddit", "Google"],
        resonantMessage: "Te decimos exactamente qué lleva y por qué, para que decidas tú.",
        angle: "Transparencia + educación",
      },
      {
        name: "La piel sensible cansada",
        age: "28-45",
        gender: "Mujer",
        income: "30.000-50.000 €",
        psychographics:
          "Ha probado cinco productos y tres le han dado reacción. Su miedo no es que no funcione, es que le irrite.",
        awarenessStage: "problem-aware",
        platforms: ["TikTok", "Foros", "YouTube"],
        resonantMessage: "Formulado para la piel que ya ha reaccionado a otras cosas.",
        angle: "Seguridad + alivio",
      },
      {
        name: "El comprador práctico",
        age: "38-55",
        gender: "Mixto",
        income: "55.000 € o más",
        psychographics:
          "Quiere un solo producto que funcione y no le interesa la rutina de siete pasos. Valora el tiempo.",
        awarenessStage: "product-aware",
        platforms: ["Google", "Email", "Amazon"],
        resonantMessage: "Un paso, por la mañana. Nada más.",
        angle: "Simplicidad + resultado",
      },
    ],
    forDummies: {
      dominantLevel: "Consciente de la solución",
      whatItMeans:
        "Tus clientes ya saben que los sueros hidratantes existen y que podrían ayudarles. Lo que no saben es en qué formulación confiar ni por qué la tuya es distinta de la que vieron ayer.",
      actionableConclusion:
        "No gastes el anuncio explicando qué es un serum. Gástalo explicando qué hace el tuyo que los demás no hacen, y demuéstralo.",
      avatarConnection:
        "El segmento consciente de la solución se solapa con la comparadora informada y el comprador práctico: ambos buscan la mejor opción y aún no son leales a ninguna marca.",
    },
  },

  competitors: {
    competitors: [
      {
        name: "Hydra Boost",
        url: "https://example.com/hydra-boost",
        targetGroup: "Mujeres 30-50 con piel deshidratada y poder adquisitivo medio-alto",
        acquisitionFunnels: [
          "Meta Ads con vídeo de rutina de 30 segundos",
          "Colaboraciones con micro-influencers de skincare",
          "Landing con testimonios y garantía de 60 días",
        ],
        mainMessage: "Hidratación inmediata que se nota al tacto desde el primer día",
        creativeExamples: [
          "Vídeo de aplicación en primer plano con textura visible",
          "Carrusel comparativo de textura frente a crema tradicional",
        ],
        awarenessLevelsTargeted: ["solution-aware", "product-aware"],
        recurringHooks: [
          "«La hidratación que tu crema no está dando»",
          "«Piel suave en 3 días o te devolvemos el dinero»",
        ],
        gaps: [
          "No abordan nunca la piel sensible ni el miedo a la reacción",
          "Su prueba social es genérica: valoraciones sin contexto de tipo de piel",
        ],
        pricing: [
          { tier: "Unidad", price: 42, currency: "USD", note: "Precio de referencia" },
          { tier: "Pack de 2", price: 71, currency: "USD", note: "Descuento del 15%" },
          { tier: "Suscripción", price: 36, currency: "USD", note: "Mensual, cancelable" },
        ],
        customerLikes: ["Textura ligera", "Envío rápido", "Garantía sin preguntas"],
        customerDislikes: [
          "Fragancia demasiado presente",
          "Reacciones puntuales en piel reactiva",
          "El frasco no permite ver cuánto queda",
        ],
        estimatedRevenue: { business: "8-12 M€ anuales", heroProduct: "≈ 55% de la facturación" },
      },
      {
        name: "Aurea Skin",
        url: "https://example.com/aurea-skin",
        targetGroup: "Compradoras premium 40+ orientadas a antiedad",
        acquisitionFunnels: ["Publirreportajes en medios de estilo de vida", "Email con secuencia educativa larga"],
        mainMessage: "Ciencia de laboratorio aplicada al cuidado diario",
        creativeExamples: ["Advertorial de 1.200 palabras sobre el envejecimiento cutáneo"],
        awarenessLevelsTargeted: ["problem-aware", "solution-aware"],
        recurringHooks: [
          "«Lo que tu dermatólogo no tiene tiempo de explicarte»",
          "«El error que cometes cada mañana con tu piel»",
        ],
        gaps: [
          "Tono muy técnico: pierden al público que solo quiere una solución simple",
          "Precio alto sin justificar el diferencial de forma tangible",
        ],
        pricing: [
          { tier: "Unidad", price: 68, currency: "USD", note: "Posicionamiento premium" },
          { tier: "Ritual completo", price: 149, currency: "USD", note: "Tres productos" },
        ],
        customerLikes: ["Sensación de producto serio", "Packaging cuidado"],
        customerDislikes: ["Precio", "Resultados lentos", "Textos demasiado largos"],
        estimatedRevenue: { business: "4-6 M€ anuales", heroProduct: "≈ 30% de la facturación" },
      },
    ],
    opportunities: [
      "Nadie en la categoría se dirige explícitamente a quien ya ha tenido una reacción con otro producto. Es el miedo más citado en foros y está desatendido.",
      "La franja de 45-70 € está vacía: o compras a 42 € o saltas a 68 €. Hay hueco para un posicionamiento intermedio bien justificado.",
      "Ninguno publica la concentración de sus activos. Hacerlo convierte la transparencia en diferencial defendible.",
    ],
  },

  avatars: {
    customerProfile:
      "Mujer de 30 a 45 años, urbana, con trabajo cualificado y poco tiempo. Ha construido una rutina de cuidado por prueba y error, y arrastra la frustración de haber gastado dinero en productos que no notó o que le irritaron.",
    attitudes: {
      religious: "Mayoritariamente laica; no es un eje relevante en la decisión de compra.",
      political: "Progresista en consumo: valora sostenibilidad y ética de marca, aunque no paga mucho más por ellas.",
      social: "Muy influida por recomendaciones de personas reales; desconfía del contenido patrocinado evidente.",
      economic: "Prudente pero dispuesta a pagar más si percibe que evita un error caro.",
    },
    hopesAndDreams: [
      "Levantarse y que la piel se vea descansada sin tener que maquillarse para salir.",
      "Dejar de investigar: encontrar el producto definitivo y no volver a pensar en ello.",
      "Que le pregunten qué se ha hecho y poder decir que solo cuida su piel.",
    ],
    wins: [
      "Consiguió eliminar la descamación de la zona T tras cambiar de limpiador.",
      "Aprendió a leer etiquetas y ya no cae en reclamos vacíos.",
    ],
    failures: [
      "Compró un serum caro por recomendación de una influencer y le provocó rojeces.",
      "Ha abandonado tres rutinas por falta de constancia o resultados.",
    ],
    externalForces: [
      "La contaminación urbana y el aire acondicionado de la oficina, a los que atribuye buena parte del problema.",
      "El estrés y el sueño insuficiente, que percibe como la causa real de su mal aspecto.",
      "La sensación de que la industria cambia el mensaje cada temporada para vender más.",
    ],
    prejudices: [
      "Cree que lo más caro suele ser más fiable, aunque le molesta admitirlo.",
      "Desconfía de las promesas con plazo concreto («en 7 días»).",
      "Asume que si un producto huele mucho, lleva algo que no necesita.",
    ],
    coreBeliefs:
      "Cuidarse es una forma de respeto propio, no vanidad. Cree que hacer las cosas bien y de forma constante da resultado, y que la mayoría de marcas exageran para vender.",
    existingSolutions: [
      {
        name: "Crema hidratante de farmacia",
        experience: "Es su base desde hace años. Funciona pero no resuelve la falta de luminosidad.",
        likes: ["Precio", "Confianza en el canal farmacia", "Sin sorpresas"],
        dislikes: ["Resultado plano", "No sienten que avance"],
        horrorStories: [],
        doesItWork: "Parcialmente: mantiene, pero no mejora.",
      },
      {
        name: "Sueros de marca viral",
        experience: "Los compró por recomendación en redes y el resultado fue irregular.",
        likes: ["Textura agradable", "Precio de entrada bajo"],
        dislikes: ["Reacciones", "Sensación de haber pagado por el envase"],
        horrorStories: [
          "Rojeces durante una semana tras la primera aplicación, con un evento de trabajo por medio.",
        ],
        doesItWork: "No de forma fiable, y el riesgo percibido es alto.",
      },
      {
        name: "Tratamiento en cabina",
        experience: "Resultados visibles pero caros y difíciles de mantener.",
        likes: ["Resultado inmediato", "Sensación de cuidado profesional"],
        dislikes: ["Precio", "Tiempo", "El efecto se pierde"],
        horrorStories: [],
        doesItWork: "Sí, pero no es sostenible en el tiempo.",
      },
    ],
    curiosity: {
      uniqueAttempts: [
        "Rutinas minimalistas de dos productos que se popularizaron como reacción al exceso de pasos.",
        "Formulaciones sin conservantes vendidas en envase monodosis, abandonadas por coste y residuo.",
      ],
      conspiracyAngle:
        "Existe la creencia extendida de que las marcas diluyen deliberadamente los activos para forzar la recompra, alimentada por la falta de concentraciones publicadas.",
      historicalAttempts: [
        "Las cremas de lanolina de los años cincuenta funcionaban por oclusión pura y se abandonaron por textura, no por eficacia.",
      ],
    },
    corruption: {
      painDeniedBelief:
        "Parte del mercado cree que la piel seca es solo genética y no tiene solución real, lo que las lleva a resignarse.",
      recentlyExacerbated:
        "La percepción de que el problema ha empeorado se asocia al tiempo en interiores con climatización y al aumento de horas de pantalla.",
      forces: ["Climatización constante", "Contaminación urbana", "Estrés sostenido y falta de sueño"],
    },
    quotes: [
      {
        text: "Me da más miedo que me irrite que gastarme el dinero. Ya he pasado por eso y no vuelvo.",
        source: "Reddit · r/SkincareAddiction",
        context: "Hilo sobre sueros para piel reactiva",
      },
      {
        text: "Llevo tres productos distintos este año. Solo quiero uno que funcione y dejar de buscar.",
        source: "Comentario en YouTube",
        context: "Vídeo de rutina de skincare",
      },
      {
        text: "Si no me dicen cuánto activo lleva, asumo que lleva poco.",
        source: "Foro de belleza",
        context: "Discusión sobre etiquetado",
      },
      {
        text: "Lo noto al tacto pero en el espejo no veo nada. ¿Es normal?",
        source: "Reseña de producto",
        context: "Valoración de 3 estrellas",
      },
    ],
  },

  master: {
    targetAwarenessLevels: ["solution-aware", "problem-aware"],
    demographicDescription:
      "Mujeres de 28 a 50 años, urbanas, con renta media-alta y poco tiempo, que ya reconocen su problema de piel y están comparando activamente entre categorías y marcas sin haber elegido ninguna.",
    psychographics: {
      painPoints: [
        "Sentir la piel tirante todo el día por mucha crema que se ponga",
        "Verse sin luz en el espejo por la mañana y necesitar maquillaje para salir",
        "Haber gastado dinero en productos que no notó",
        "Miedo real a la reacción: ya le ha pasado y fue en mal momento",
        "Cansancio de investigar y comparar sin llegar a una conclusión",
      ],
      hopesAndDreams: [
        "Levantarse con la piel descansada sin depender del maquillaje",
        "Dejar de probar y quedarse con un producto para siempre",
        "Sentir que por fin está haciendo algo que funciona",
      ],
      selfImage:
        "Se ve como alguien responsable que se informa antes de comprar, no como alguien vanidoso. Hablarle de autocuidado y criterio funciona; hablarle de belleza o de aparentar, no.",
      languageToUse: [
        "Piel tirante",
        "Sin luz",
        "Que no me irrite",
        "Sin complicarme",
        "Quiero dejar de probar cosas",
      ],
      languageToAvoid: [
        "Milagro",
        "Rejuvenece 10 años",
        "En solo 3 días",
        "Antiarrugas",
        "Fórmula secreta",
      ],
      mainPromises: [
        "Hidratación que se mantiene todo el día, no solo al aplicarlo",
        "Formulado y probado para piel que ya ha reaccionado a otros productos",
        "Concentración de activos publicada, sin letra pequeña",
        "Un solo paso por la mañana: sin rutina de siete productos",
        "Si en 60 días no lo notas, te devolvemos el dinero",
      ],
    },
    objections: [
      {
        objection: "48 € me parece caro para un serum",
        howToAddress:
          "Comparar con el coste real de seguir probando: tres productos fallidos de 25 € ya son más caros. Añadir garantía para que el riesgo lo asuma la marca.",
      },
      {
        objection: "Tengo la piel sensible y me da miedo la reacción",
        howToAddress:
          "Es la objeción principal y nadie la trata. Publicar el test de tolerancia, la ausencia de fragancia y testimonios explícitos de piel reactiva.",
      },
      {
        objection: "Ya he probado sueros y no noté nada",
        howToAddress:
          "Diferenciar por mecanismo, no por promesa: explicar por qué el peso molecular cambia dónde se queda el activo.",
      },
      {
        objection: "No sé si es para mi tipo de piel",
        howToAddress: "Guía de dos preguntas en la landing que devuelva una respuesta clara antes de comprar.",
      },
    ],
    existingSolutions: [
      {
        solution: "Crema hidratante convencional",
        whyInsufficient: "Actúa en superficie: alivia la tirantez un rato pero no cambia la luminosidad.",
      },
      {
        solution: "Sueros virales de bajo precio",
        whyInsufficient: "Resultado irregular y riesgo de reacción, que es justo el miedo dominante.",
      },
      {
        solution: "Tratamiento en cabina",
        whyInsufficient: "Funciona pero es caro y no sostenible; el efecto se pierde al dejarlo.",
      },
    ],
  },

  desireExtraction: {
    directPerformances: [
      "Aporta ácido hialurónico de bajo peso molecular a la piel",
      "Retiene agua en las capas superficiales durante horas",
      "Refuerza la barrera cutánea con vitamina E",
      "Se absorbe sin dejar residuo graso",
    ],
    secondaryPerformances: [
      "La piel deja de tirar → desaparece la molestia constante durante el día",
      "Mejora la luminosidad → menos necesidad de maquillaje por la mañana",
      "Barrera más fuerte → menos reacciones a otros productos",
      "Rutina de un paso → menos tiempo y menos decisiones cada mañana",
      "Resultado visible → deja de buscar y comparar productos",
    ],
    mapping: [
      {
        performance: "La piel deja de tirar",
        massDesire: "Alivio de una molestia física constante",
        desireType: "Salud / comodidad",
      },
      {
        performance: "Mejora la luminosidad",
        massDesire: "Verse bien sin esfuerzo y sentirse segura",
        desireType: "Belleza / confianza",
      },
      {
        performance: "Menos reacciones",
        massDesire: "Seguridad y ausencia de riesgo",
        desireType: "Seguridad",
      },
      {
        performance: "Rutina de un paso",
        massDesire: "Ahorro de tiempo y de carga mental",
        desireType: "Conveniencia / libertad",
      },
      {
        performance: "Deja de buscar",
        massDesire: "Dejar de perder dinero en intentos fallidos",
        desireType: "Ahorro",
      },
    ],
    ratings: [
      {
        desire: "Alivio de una molestia física constante",
        urgency: "alta",
        stayingPower: "alta",
        scope: "alta",
        note: "Se siente cada día y afecta a todo el mercado objetivo",
      },
      {
        desire: "Seguridad y ausencia de riesgo",
        urgency: "alta",
        stayingPower: "alta",
        scope: "media",
        note: "Muy intenso en quien ya ha tenido una reacción",
      },
      {
        desire: "Verse bien sin esfuerzo y sentirse segura",
        urgency: "media",
        stayingPower: "alta",
        scope: "alta",
        note: "Motor emocional de fondo, menos urgente pero muy amplio",
      },
      {
        desire: "Dejar de perder dinero en intentos fallidos",
        urgency: "alta",
        stayingPower: "media",
        scope: "alta",
        note: "Se activa justo en el momento de decidir la compra",
      },
      {
        desire: "Ahorro de tiempo y de carga mental",
        urgency: "media",
        stayingPower: "alta",
        scope: "media",
        note: "Refuerzo excelente, rara vez motivo principal",
      },
    ],
    dominant: {
      performance: "La piel deja de tirar durante todo el día",
      desire: "Alivio de una molestia física constante",
      reasoning:
        "Combina las tres dimensiones en su nivel máximo: se siente a diario, no remite solo y lo comparte prácticamente todo el mercado objetivo. Es la única actuación que cumple las tres.",
    },
    supportingProof: [
      {
        performance: "Menos reacciones",
        howItSupports: "Neutraliza la objeción que frena la compra en el segmento de piel sensible.",
      },
      {
        performance: "Rutina de un paso",
        howItSupports: "Hace creíble que el alivio se mantenga: si es fácil, se sostiene en el tiempo.",
      },
      {
        performance: "Deja de buscar",
        howItSupports: "Justifica el precio frente al coste acumulado de seguir probando.",
      },
    ],
    headlines: {
      problemAware:
        "Si tu piel sigue tirante después de la crema, el problema no es cuánta te pones.",
      solutionAware:
        "No todos los sueros de hialurónico llegan al mismo sitio. Este te dice exactamente dónde llega.",
      productAware:
        "48 €, la concentración publicada y 60 días para devolverlo. Decide tú si vale la pena.",
    },
    wantStatements: [
      "Quiero dejar de notar la piel tirante a media tarde.",
      "Quiero verme descansada sin tener que maquillarme.",
      "Quiero un producto que no me irrite, aunque cueste más.",
      "Quiero dejar de probar cosas y quedarme con una.",
      "Quiero saber exactamente qué me estoy poniendo en la cara.",
    ],
  },

  desireValidation: {
    desires: [
      {
        statement: "Quiero dejar de notar la piel tirante todo el día",
        evidence: [
          {
            text: "Es que me tira desde que me levanto hasta que me acuesto, da igual lo que use.",
            source: "Reddit · r/SkincareAddiction",
          },
          {
            text: "Me paso el día tocándome la cara porque la noto rara.",
            source: "Comentario en Instagram",
          },
        ],
        emotionalTriggers: ["Frustración diaria", "Molestia constante", "Resignación"],
        urgency: 5,
        stayingPower: 5,
        scope: 5,
        reasoning: {
          urgency: "Se manifiesta a diario y de forma consciente; no es un problema que se pueda posponer.",
          stayingPower: "Crónico: no remite solo y empeora con climatización y frío.",
          scope: "Afecta prácticamente a todo el mercado objetivo de la categoría.",
        },
        totalScore: 15,
      },
      {
        statement: "Quiero un producto que no me irrite",
        evidence: [
          {
            text: "Me da más miedo que me irrite que gastarme el dinero.",
            source: "Reddit · r/SkincareAddiction",
          },
          {
            text: "Después de las rojeces de la última vez, ya no pruebo nada sin leerlo entero.",
            source: "Foro de belleza",
          },
        ],
        emotionalTriggers: ["Miedo", "Desconfianza", "Necesidad de control"],
        urgency: 5,
        stayingPower: 4,
        scope: 4,
        reasoning: {
          urgency: "Bloquea la compra en el momento exacto de decidir: es una objeción activa, no latente.",
          stayingPower: "Persiste mientras no haya una marca en la que confíe, pero se resuelve al encontrarla.",
          scope: "Muy intenso en el segmento de piel sensible, que es amplio pero no universal.",
        },
        totalScore: 13,
      },
      {
        statement: "Quiero dejar de perder dinero en productos que no funcionan",
        evidence: [
          {
            text: "Llevo tres productos distintos este año. Solo quiero uno que funcione.",
            source: "Comentario en YouTube",
          },
        ],
        emotionalTriggers: ["Hartazgo", "Sensación de haber sido engañada", "Cautela"],
        urgency: 4,
        stayingPower: 4,
        scope: 5,
        reasoning: {
          urgency: "Se activa con fuerza justo en el momento de la decisión de compra.",
          stayingPower: "Se acumula con cada intento fallido y no desaparece con el tiempo.",
          scope: "Casi cualquier comprador de la categoría acumula algún intento fallido.",
        },
        totalScore: 13,
      },
      {
        statement: "Quiero verme descansada sin tener que maquillarme",
        evidence: [
          {
            text: "Ojalá poder salir de casa sin base algún día.",
            source: "TikTok · comentario",
          },
        ],
        emotionalTriggers: ["Aspiración", "Autoestima", "Libertad"],
        urgency: 3,
        stayingPower: 5,
        scope: 4,
        reasoning: {
          urgency: "Es un deseo de fondo, no una molestia que exija resolverse hoy.",
          stayingPower: "Permanente: forma parte de cómo se ve a sí misma.",
          scope: "Amplio, aunque se expresa menos abiertamente que la molestia física.",
        },
        totalScore: 12,
      },
      {
        statement: "Quiero simplificar mi rutina y dejar de pensar en ello",
        evidence: [
          {
            text: "No tengo tiempo para siete pasos, con dos me sobra.",
            source: "Reddit · r/SkincareAddiction",
          },
        ],
        emotionalTriggers: ["Cansancio", "Carga mental", "Deseo de control"],
        urgency: 3,
        stayingPower: 4,
        scope: 3,
        reasoning: {
          urgency: "Molesta pero se tolera; nadie compra solo por esto.",
          stayingPower: "Se mantiene mientras la rutina siga siendo compleja.",
          scope: "Relevante sobre todo en perfiles con poco tiempo.",
        },
        totalScore: 10,
      },
    ],
    ranking: [
      "Quiero dejar de notar la piel tirante todo el día",
      "Quiero un producto que no me irrite",
      "Quiero dejar de perder dinero en productos que no funcionan",
      "Quiero verme descansada sin tener que maquillarme",
      "Quiero simplificar mi rutina y dejar de pensar en ello",
    ],
    adImplications: [
      {
        desire: "Quiero dejar de notar la piel tirante todo el día",
        whyScalable:
          "Es universal dentro de la categoría y se puede dramatizar sin hacer ninguna promesa estética arriesgada.",
        howToDramatize:
          "Mostrar el gesto involuntario de tocarse la cara a media tarde, y el mismo momento sin ese gesto.",
      },
      {
        desire: "Quiero un producto que no me irrite",
        whyScalable:
          "Nadie en la categoría lo está trabajando: convierte una objeción desatendida en el gancho principal.",
        howToDramatize:
          "Abrir con la reacción pasada («la última vez acabé con la cara roja una semana») y contraponer el test de tolerancia.",
      },
      {
        desire: "Quiero dejar de perder dinero en productos que no funcionan",
        whyScalable: "Justifica el precio sin defenderlo: reencuadra el gasto como ahorro.",
        howToDramatize: "El cajón lleno de frascos a medio usar, con el coste acumulado en pantalla.",
      },
    ],
    supportingDesires: [
      {
        desire: "Quiero simplificar mi rutina",
        howItReinforces: "Hace creíble que el alivio se sostenga: una rutina sencilla sí se mantiene en el tiempo.",
      },
      {
        desire: "Quiero verme descansada",
        howItReinforces: "Aporta la recompensa emocional después de que el mensaje racional haya convencido.",
      },
    ],
    top5: [
      "Quiero dejar de notar la piel tirante todo el día",
      "Quiero un producto que no me irrite",
      "Quiero dejar de perder dinero en productos que no funcionan",
      "Quiero verme descansada sin tener que maquillarme",
      "Quiero simplificar mi rutina y dejar de pensar en ello",
    ],
  },

  // La maqueta es de e-commerce: los tres de casino no tienen datos.
  regulation: null,
  payments: null,
  casinoLandscape: null,

  documents: {
    awareness: {
      status: "ready",
      generatedAt,
      markdown:
        "# 1 · Investigación de concienciación\n\nLa mayoría del mercado se encuentra actualmente en la etapa **consciente de la solución**. El 41% de los compradores potenciales sabe que los sueros hidratantes existen y está comparando activos y marcas, pero no ha elegido ninguna.\n\n## Mercado total direccionable\n\nEl mercado europeo de cuidado facial premium mueve unos 4.800 M USD con una base estimada de 11,2 millones de compradores activos y un crecimiento del 7,4% anual hasta 2030. La categoría crece por encima del cuidado facial general porque el consumidor está migrando de la crema genérica a la rutina con activos concretos.\n\n## Implicaciones publicitarias\n\nNo hay que educar sobre el problema ni convencer de la categoría: hay que ganar la comparación. El tono debe ser cálido y científico, con la composición y la concentración visibles, y prueba social específica de piel sensible.",
    },
    competitors: {
      status: "ready",
      generatedAt,
      markdown:
        "# 2 · Investigación de la competencia\n\nSe han analizado dos marcas DTC con venta principalmente online.\n\n## Hydra Boost\n\nSe dirige a mujeres de 30 a 50 años con piel deshidratada. Adquiere sobre todo por Meta Ads con vídeo de rutina corto y colaboraciones con micro-influencers. Su mensaje central es la hidratación inmediata perceptible al tacto.\n\n**Brecha detectada:** no abordan nunca la piel sensible ni el miedo a la reacción, que es la objeción más citada en foros.\n\n## Aurea Skin\n\nPosicionamiento premium a 68 € con tono muy técnico y publirreportajes largos. Pierden al público que solo quiere una solución simple.\n\n## Oportunidades\n\nLa franja de 45 a 70 € está vacía y ninguna marca publica la concentración de sus activos. La transparencia es un diferencial defendible y sin ocupar.",
    },
    avatars: {
      status: "ready",
      generatedAt,
      markdown:
        "# 3 · Investigación de avatares\n\nEl cliente principal es una mujer de 30 a 45 años, urbana, con trabajo cualificado y poco tiempo, que ha construido su rutina por prueba y error.\n\n## Lo que dicen con sus propias palabras\n\n> «Me da más miedo que me irrite que gastarme el dinero. Ya he pasado por eso y no vuelvo.» — Reddit\n\n> «Llevo tres productos distintos este año. Solo quiero uno que funcione y dejar de buscar.» — YouTube\n\n> «Si no me dicen cuánto activo lleva, asumo que lleva poco.» — Foro de belleza\n\n## Creencias fundamentales\n\nCuidarse es una forma de respeto propio, no vanidad. Cree que la constancia da resultado y que la mayoría de marcas exageran para vender.",
    },
    master: {
      status: "ready",
      generatedAt,
      markdown:
        "# 4 · Investigación maestra\n\nDocumento único que condensa los tres anteriores para alimentar la redacción de anuncios y publirreportajes sin volver a cargar la investigación completa.\n\n## Mercado objetivo\n\nMujeres de 28 a 50 años, urbanas, renta media-alta y poco tiempo, en los niveles consciente de la solución y consciente del problema.\n\n## Promesas principales\n\n- Hidratación que se mantiene todo el día, no solo al aplicarlo\n- Formulado y probado para piel que ya ha reaccionado a otros productos\n- Concentración de activos publicada, sin letra pequeña\n- Un solo paso por la mañana\n- 60 días para devolverlo\n\n## Lenguaje\n\n**Usar:** piel tirante, sin luz, que no me irrite, sin complicarme.\n\n**Evitar:** milagro, rejuvenece 10 años, en solo 3 días, fórmula secreta.",
    },
    "desire-extraction": {
      status: "ready",
      generatedAt,
      markdown:
        "# 5 · Extracción del deseo\n\n## Actuación dominante\n\nLa piel deja de tirar durante todo el día, que satisface el deseo masivo de **alivio de una molestia física constante**.\n\nEs la única actuación que puntúa alto en las tres dimensiones de Schwartz a la vez: se siente a diario, no remite sola y la comparte prácticamente todo el mercado objetivo.\n\n## Titulares por nivel de conciencia\n\n- **Consciente del problema:** «Si tu piel sigue tirante después de la crema, el problema no es cuánta te pones.»\n- **Consciente de la solución:** «No todos los sueros de hialurónico llegan al mismo sitio. Este te dice exactamente dónde llega.»\n- **Consciente del producto:** «48 €, la concentración publicada y 60 días para devolverlo.»",
    },
    "desire-validation": {
      status: "ready",
      generatedAt,
      markdown:
        "# 6 · Validación del deseo masivo\n\nLos cinco deseos candidatos se han puntuado de 1 a 5 en urgencia, permanencia y alcance, con evidencia extraída de foros, reseñas y comentarios.\n\n## Ranking final\n\n1. Quiero dejar de notar la piel tirante todo el día — 15/15\n2. Quiero un producto que no me irrite — 13/15\n3. Quiero dejar de perder dinero en productos que no funcionan — 13/15\n4. Quiero verme descansada sin tener que maquillarme — 12/15\n5. Quiero simplificar mi rutina — 10/15\n\n## Implicación principal\n\nEl deseo más fuerte es el alivio físico, pero el que más diferencia frente a la competencia es el miedo a la irritación: nadie lo está trabajando y aparece en casi todas las conversaciones reales.",
    },
    // La maqueta es de un producto de e-commerce: los de casino no se rellenan.
    regulation: { status: "empty", generatedAt: null, markdown: "" },
    payments: { status: "empty", generatedAt: null, markdown: "" },
    "casino-landscape": { status: "empty", generatedAt: null, markdown: "" },
  },
};

/** Ganchos de ejemplo, coherentes con el plan derivado de la investigación. */
export const hooksFixture: ProductHook[] = [
  {
    id: "hook-demo-1",
    productId: "own-1",
    title: "El gesto de media tarde",
    body: "¿Te tocas la cara a media tarde sin darte cuenta? No es un tic. Es tu piel pidiendo agua que la crema no le está dando.",
    awarenessLevel: "problem-aware",
    desire: "Quiero dejar de notar la piel tirante todo el día",
    angle: "Alivio + reconocimiento",
    format: "Apertura de anuncio",
    isUsed: false,
    createdAt: generatedAt,
    batchId: "batch-problem-1",
  },
  {
    id: "hook-demo-2",
    productId: "own-1",
    title: "El problema no es la cantidad",
    body: "Llevas años poniéndote más crema. Y te sigue tirando. El problema nunca fue cuánta te pones, sino hasta dónde llega.",
    awarenessLevel: "problem-aware",
    desire: "Quiero dejar de notar la piel tirante todo el día",
    angle: "Reencuadre del problema",
    format: "Titular",
    isUsed: true,
    createdAt: generatedAt,
    usedAt: "2026-07-22T10:00:00.000Z",
    batchId: "batch-problem-1",
  },
  {
    id: "hook-demo-3",
    productId: "own-1",
    title: "La semana de las rojeces",
    body: "La última vez que probaste algo nuevo acabaste con la cara roja una semana. Y tenías un evento. Por eso este se testó primero en piel reactiva.",
    awarenessLevel: "problem-aware",
    desire: "Quiero un producto que no me irrite",
    angle: "Miedo reconocido + prueba",
    format: "Apertura de anuncio",
    isUsed: false,
    createdAt: generatedAt,
    batchId: "batch-problem-2",
  },
  {
    id: "hook-demo-4",
    productId: "own-1",
    title: "No todos llegan al mismo sitio",
    body: "Todos los sueros dicen llevar ácido hialurónico. Ninguno te dice a qué profundidad se queda. Nosotros sí, y por eso publicamos la concentración.",
    awarenessLevel: "solution-aware",
    desire: "Quiero dejar de notar la piel tirante todo el día",
    angle: "Diferenciación por mecanismo",
    format: "Titular",
    isUsed: false,
    createdAt: generatedAt,
    batchId: "batch-solution-1",
  },
  {
    id: "hook-demo-5",
    productId: "own-1",
    title: "Lo que no ponen en la etiqueta",
    body: "Si una marca no te dice cuánto activo lleva, ya te ha dicho todo lo que necesitas saber.",
    awarenessLevel: "solution-aware",
    desire: "Quiero un producto que no me irrite",
    angle: "Transparencia como prueba",
    format: "Gancho corto",
    isUsed: false,
    createdAt: generatedAt,
    batchId: "batch-solution-2",
  },
  {
    id: "hook-demo-6",
    productId: "own-1",
    title: "El cajón",
    body: "Abre el cajón del baño y cuenta los frascos a medio usar. Ahora suma lo que costaron. Eso es lo que cuesta seguir probando.",
    awarenessLevel: "solution-aware",
    desire: "Quiero dejar de perder dinero en productos que no funcionan",
    angle: "Coste acumulado",
    format: "Apertura de anuncio",
    isUsed: true,
    createdAt: generatedAt,
    usedAt: "2026-07-24T12:00:00.000Z",
    batchId: "batch-solution-3",
  },
  {
    id: "hook-demo-7",
    productId: "own-1",
    title: "Decide tú",
    body: "48 €. La concentración publicada. 60 días para devolverlo. No vamos a convencerte: te damos los datos y decides tú.",
    awarenessLevel: "product-aware",
    desire: "Quiero dejar de perder dinero en productos que no funcionan",
    angle: "Riesgo invertido",
    format: "Cierre de anuncio",
    isUsed: false,
    createdAt: generatedAt,
    batchId: "batch-product-1",
  },
  {
    id: "hook-demo-8",
    productId: "own-1",
    title: "Sin base",
    body: "El objetivo no es taparte mejor. Es que algún día salgas de casa sin pensar en la base.",
    awarenessLevel: "product-aware",
    desire: "Quiero dejar de notar la piel tirante todo el día",
    angle: "Recompensa emocional",
    format: "Gancho corto",
    isUsed: false,
    createdAt: generatedAt,
    batchId: "batch-product-2",
  },
];
