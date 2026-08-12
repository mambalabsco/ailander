/**
 * Lo que el agente puede **hacer**, no solo decir.
 *
 * ## Por qué herramientas y no una llamada que devuelve texto
 *
 * Porque «esta semana insiste en el sueño» no es una pregunta: es una orden que
 * toca la cola. Con una llamada que devuelve texto, el agente contesta «claro,
 * he preparado tres publicaciones» y no ha preparado nada — y suena tan bien que
 * nadie lo comprueba.
 *
 * Aquí se declara qué puede tocar. Fuera de esta lista no puede nada, que es lo
 * que hace seguro dejarle escribir en la cola.
 */

export const TOOLS = [
  {
    name: "ver_cola",
    description:
      "Lee las publicaciones que hay en la cola de este producto: su formato, su gancho, si el producto sale, su estado y su fecha. Úsalo antes de escribir nada para no repetir lo que ya está.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
      additionalProperties: false,
    },
  },
  {
    name: "escribir_publicaciones",
    description:
      "Escribe publicaciones nuevas y las deja en la cola, en borrador. Elige el formato según lo que quieras contar: reel para una historia con principio y final, carrusel para lo que necesita orden, feed para lo que se entiende de un vistazo.",
    input_schema: {
      type: "object" as const,
      properties: {
        formato: { type: "string", enum: ["feed", "carrusel", "reel", "historia"] },
        cuantas: { type: "integer", minimum: 1, maximum: 10 },
        /*
         * El enfoque es texto libre a propósito.
         *
         * Es lo que traduce «insiste en el sueño» en algo que llega al encargo.
         * Con una lista cerrada de temas habría que mantenerla, y la
         * conversación siempre pide algo que no está en ella.
         */
        enfoque: {
          type: "string",
          description: "En qué insistir, con las palabras de quien lo pide. Vacío si no se dijo.",
        },
      },
      required: ["formato", "cuantas"],
      additionalProperties: false,
    },
  },
  {
    name: "programar",
    description:
      "Pone fecha y hora a una publicación de la cola. La fecha va en formato ISO. No aprueba: solo dice cuándo saldría.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        cuando: { type: "string", description: "Fecha y hora en ISO, por ejemplo 2026-08-14T19:00:00Z" },
      },
      required: ["id", "cuando"],
      additionalProperties: false,
    },
  },
  {
    name: "planificar_semana",
    description:
      "Planifica varios días de una vez: reparte los formatos, escribe las piezas y les pone fecha, una al día. Úsalo cuando pidan una semana o un calendario, no cuando pidan una publicación suelta.",
    input_schema: {
      type: "object" as const,
      properties: {
        dias: { type: "integer", minimum: 1, maximum: 14 },
        hora: { type: "integer", minimum: 0, maximum: 23 },
      },
      required: ["dias"],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

/**
 * Lo que el agente **no** hace, y va escrito en su encargo.
 *
 * Aprobar y publicar se quedan fuera a propósito. El agente propone y una
 * persona decide qué sale a la cuenta de la marca: es la única barrera que hay
 * entre un malentendido en una frase y algo publicado que no se puede retirar.
 */
export function buildAgentSystem(input: {
  productName: string;
  audience: string;
  country: string;
  context?: string;
}): string {
  return [
    `Llevas el Instagram de ${input.productName}, para ${input.audience} en ${input.country}.`,
    ``,
    `Trabajas con herramientas: mira la cola antes de escribir, y escribe solo cuando te lo pidan.`,
    ``,
    ...(input.context ? [`## Sobre el producto`, ``, input.context, ``] : []),
    `## Cómo trabajas`,
    ``,
    `- **Mira la cola antes de proponer.** Repetir el gancho o la escena de algo que ya está es el fallo que más se nota en una cuenta.`,
    `- **No apruebas ni publicas.** Eso lo decide una persona. Tú dejas las piezas en borrador y dices qué has hecho.`,
    `- Cuando te pidan algo vago —«más humano», «insiste en el sueño»— tradúcelo a formatos y enfoques concretos y dilo antes de hacerlo.`,
    `- Si lo que te piden no encaja con lo que hay en la cola, dilo. Estás para tener criterio, no para obedecer.`,
    `- Responde corto. Lo que importa es lo que dejas hecho, no explicarlo.`,
  ].join("\n");
}
