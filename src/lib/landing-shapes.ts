/**
 * Qué forma tiene la página, que no es lo mismo que qué dice.
 *
 * Sin imports, probado en `landing-shapes.test.ts`.
 *
 * ## Por qué salían todas iguales
 *
 * El prompt exigía que aparecieran valoración, autor, dato, mecanismo,
 * comparativa, garantía y preguntas, en ese orden aproximado. Esa lista salió de
 * tres publirreportajes reales que funcionan, y **para publirreportajes está
 * bien**. El problema es que era la única forma posible: daba igual el producto,
 * el ángulo y el marco, salía la misma página con otro texto.
 *
 * Una página de venta no tiene una forma. Un caso clínico no se parece a una
 * carta personal, y una comparativa no se parece a un diario de treinta días.
 * Aquí están esas formas, cada una con su orden, su voz y lo que **no** debe
 * llevar — que es tan importante como lo que sí: la ficha del autor con
 * credenciales convierte una carta personal en otro publirreportaje.
 *
 * ## Y una forma sin forma
 *
 * `libre` no impone nada: ni secciones obligatorias, ni orden, ni longitud. Es
 * para cuando ninguna de las demás encaja, y es la única que puede salir mal —
 * también la única que puede salir con algo que a nadie se le había ocurrido.
 * Está a propósito.
 */

export interface LandingShape {
  id: string;
  label: string;
  note: string;
  /** Cómo se cuenta: quién habla y desde dónde. */
  voice: string;
  /** El recorrido, en orden. Vacío en la forma libre. */
  beats: string[];
  /** Lo que no puede llevar. Es lo que la distingue de las demás. */
  avoid: string[];
}

export const LANDING_SHAPES: LandingShape[] = [
  {
    id: "publirreportaje",
    label: "Publirreportaje",
    note: "El artículo de salud con autor, datos y mecanismo. El de siempre.",
    voice: "Un periodista de salud que investiga y explica. Tercera persona.",
    beats: [
      "Titular de noticia y ficha del autor con credenciales",
      "El problema contado desde un caso concreto",
      "Por qué lo de siempre no funciona",
      "El mecanismo, numerado",
      "El producto, ya avanzada la página",
      "Prueba social, garantía y preguntas",
    ],
    avoid: ["Hablar en primera persona", "Empezar por el producto"],
  },
  {
    id: "carta",
    label: "Carta personal",
    note: "Alguien cuenta lo que le pasó, de principio a fin. Sin aparato editorial.",
    voice:
      "La persona a la que le pasó, en primera persona, escribiendo a alguien que está igual.",
    beats: [
      "Una frase que sitúa el peor momento",
      "Cómo se llegó ahí, con fechas y detalles pequeños",
      "Lo que se probó y no sirvió",
      "El giro: qué cambió y por qué",
      "Cómo está ahora, sin exagerar",
      "Qué haría en tu lugar",
    ],
    avoid: [
      "Ficha de autor con credenciales médicas",
      "Datos con porcentajes grandes",
      "Comparativas en dos columnas",
      "Cualquier cosa que parezca un artículo de revista",
    ],
  },
  {
    id: "caso",
    label: "Caso clínico",
    note: "Un paciente, seguido en el tiempo. Frío, con fechas y mediciones.",
    voice: "Un profesional describiendo un caso que llevó. Sobrio, sin adjetivos.",
    beats: [
      "El caso en una línea: quién, qué edad, qué traía",
      "Qué se encontró al principio",
      "Qué se descartó y por qué",
      "Qué se hizo, semana a semana",
      "Qué se midió al final",
      "Qué se le dice a quien está igual",
    ],
    avoid: ["Comentarios de redes sociales", "Urgencia y descuentos en el cuerpo", "Exclamaciones"],
  },
  {
    id: "comparativa",
    label: "Comparativa",
    note: "Frente a lo que ya se probó: la pregunta real de quien ya gastó dinero.",
    voice: "Alguien que probó varias cosas y las pone una al lado de otra, sin vender.",
    beats: [
      "La pregunta: por qué lo anterior no funcionó",
      "Qué hay en el mercado y qué promete cada cosa",
      "En qué falla cada una, concreto",
      "Qué hace distinto esto",
      "Para quién **no** es",
      "Qué cuesta y qué pasa si no funciona",
    ],
    avoid: ["Nombrar marcas reales de la competencia", "Prometer que funciona para todo el mundo"],
  },
  {
    id: "diario",
    label: "Diario de días",
    note: "Día 1, día 7, día 30. Se lee entero porque se quiere saber cómo acaba.",
    voice: "La misma persona escribiendo en distintos momentos, sin saber aún el final.",
    beats: [
      "Día 1: por qué empieza y qué espera",
      "Los primeros días: nada, o casi nada",
      "El día en que se nota algo pequeño",
      "La mitad: lo que ya es evidente",
      "El final: qué cambió de verdad",
      "Lo que haría distinto",
    ],
    avoid: ["Resultados el primer día", "Ficha de autor", "Tono de artículo"],
  },
  {
    id: "entrevista",
    label: "Entrevista",
    note: "Preguntas y respuestas. Las objeciones salen como preguntas incómodas.",
    voice: "Un entrevistador que pregunta lo que preguntaría el lector, incluso lo molesto.",
    beats: [
      "Quién es el entrevistado y por qué se le pregunta",
      "La pregunta obvia, respondida sin rodeos",
      "La pregunta incómoda: por qué debería creerle",
      "Cómo funciona, explicado a alguien que no sabe",
      "Qué no hace",
      "Dónde se consigue",
    ],
    avoid: ["Respuestas de folleto", "Que el entrevistado no admita ninguna limitación"],
  },
  {
    id: "libre",
    label: "Libre",
    note: "Sin plantilla: decide la forma según el producto y el ángulo. Puede salir mal.",
    voice: "La que pida la historia.",
    beats: [],
    avoid: [],
  },
];

export function findShape(id: string): LandingShape {
  return LANDING_SHAPES.find((shape) => shape.id === id) ?? LANDING_SHAPES[0];
}

/**
 * El bloque del encargo que describe la forma.
 *
 * La libre devuelve una instrucción **corta a propósito**. Cuanto más se le
 * explica cómo tiene que ser una página libre, menos libre es: se acaba
 * describiendo otra plantilla con otras palabras.
 */
export function shapeRules(shape: LandingShape): string {
  if (shape.beats.length === 0) {
    return [
      "## La forma",
      "",
      "**Decídela tú.** Ninguna estructura impuesta: ni secciones obligatorias, ni",
      "orden, ni longitud fija. Mira el producto, el público y el ángulo y elige",
      "cómo se cuenta mejor — y si eso es una lista de siete puntos, o una sola",
      "escena larga, o un desmontaje de un mito, adelante.",
      "",
      "Lo único que se mantiene: que quien la lea entienda qué le pasa, por qué, y",
      "qué puede hacer. Explica en dos frases qué forma elegiste y por qué.",
    ].join("\n");
  }

  return [
    "## La forma",
    "",
    `**${shape.label}.** ${shape.note}`,
    "",
    `Voz: ${shape.voice}`,
    "",
    "El recorrido, en este orden:",
    "",
    ...shape.beats.map((beat, index) => `${index + 1}. ${beat}`),
    "",
    "### Lo que esta forma no lleva",
    "",
    ...shape.avoid.map((item) => `- ${item}`),
    "",
    "Eso último importa tanto como lo de arriba: meterle el aparato de otra forma",
    "la convierte en otra forma. Una carta personal con ficha de autor y datos con",
    "porcentajes ya no es una carta, es un publirreportaje con otro principio.",
  ].join("\n");
}

/**
 * Una forma distinta a la de la última página del producto.
 *
 * Es lo que hace que la segunda no salga igual que la primera sin tener que
 * acordarse de cambiarlo a mano. Se pasa lo ya usado y se devuelve lo que queda;
 * cuando ya se han usado todas, vuelve a empezar en vez de quedarse sin nada.
 */
export function nextShape(used: string[], preferred?: string): LandingShape {
  if (preferred) return findShape(preferred);

  const fresh = LANDING_SHAPES.filter(
    (shape) => shape.id !== "libre" && !used.includes(shape.id),
  );

  return fresh[0] ?? LANDING_SHAPES[0];
}
