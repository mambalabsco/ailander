/**
 * El grafo de un anuncio: qué nodos hay, qué sale de cada uno y en qué orden.
 *
 * Sin imports, probado en `graph.test.ts`.
 *
 * ## Qué es esto y qué no
 *
 * Es el **modelo** del lienzo, no el lienzo. Aquí vive lo que decide si un flujo
 * se puede ejecutar y en qué orden: qué produce cada nodo, qué acepta el
 * siguiente, y si el conjunto tiene sentido. El dibujo —arrastrar cajas, las
 * curvas entre ellas— es otra capa encima y no puede saber nada de esto.
 *
 * Están separados a propósito. Lo que rompe un flujo no es el dibujo: es
 * conectar una voz a la entrada de un generador de imagen, o cerrar un ciclo sin
 * darse cuenta. Eso se comprueba con datos, y aquí se puede probar sin arrancar
 * un navegador.
 *
 * ## Por qué los tipos de puerto y no «todo con todo»
 *
 * Porque el fallo silencioso vuelve a estar ahí. Conectar un nodo de música a la
 * entrada de referencias de un generador de vídeo no da error: se manda un
 * campo que el modelo ignora y sale un vídeo generado sin referencia. Con
 * puertos tipados, esa conexión no se puede dibujar.
 */

/** Qué viaja por una conexión. */
export type PortKind = "texto" | "imagen" | "video" | "audio" | "guion" | "producto";

export type NodeGroup = "fuente" | "idea" | "produccion" | "montaje";

export interface NodeType {
  id: string;
  label: string;
  group: NodeGroup;
  /** Qué acepta en cada entrada, en orden. Vacío es un nodo de partida. */
  accepts: { kind: PortKind; label: string; required: boolean; many?: boolean }[];
  /** Qué produce. Un nodo produce una cosa; para varias, se separan nodos. */
  produces: PortKind;
  note: string;
}

/**
 * Los nodos que existen, agrupados como el trabajo.
 *
 * Cada uno se corresponde con algo que la plataforma ya sabe hacer: el lienzo no
 * añade capacidades, las ordena. Un nodo que no tenga detrás una acción real
 * sería una caja que se puede dibujar y no se puede ejecutar.
 */
export const NODE_TYPES: NodeType[] = [
  {
    id: "producto",
    label: "Producto",
    group: "fuente",
    accepts: [],
    produces: "producto",
    note: "De dónde salen el nombre, la investigación y la foto del envase.",
  },
  {
    id: "avatar",
    label: "Avatar",
    group: "fuente",
    accepts: [],
    produces: "imagen",
    note: "Una cara guardada, para que el anuncio sea de alguien.",
  },
  {
    id: "archivo",
    label: "Imagen",
    group: "fuente",
    accepts: [],
    produces: "imagen",
    note: "Una foto del producto, una tuya subida o una dirección pegada.",
  },
  {
    id: "guion",
    label: "Guion",
    group: "idea",
    accepts: [
      { kind: "producto", label: "Producto", required: true },
      { kind: "guion", label: "Copy de referencia", required: false },
    ],
    produces: "guion",
    note: "Escribe el guion por tomas a partir del producto y su investigación.",
  },
  {
    /*
     * Escribir el copy dentro del lienzo.
     *
     * Sin esto, la única forma de meter texto en un flujo era teclearlo en un
     * nodo de prompt — y entonces el copy no sabe nada del producto: ni de la
     * oferta, ni del público, ni de los ángulos ya investigados.
     */
    id: "copy",
    label: "Copy",
    group: "idea",
    accepts: [
      { kind: "producto", label: "Producto", required: true },
      { kind: "texto", label: "Ángulo", required: false },
    ],
    produces: "guion",
    note: "Escribe el texto del anuncio, la locución o solo el gancho.",
  },
  {
    id: "prompt",
    label: "Prompt",
    group: "idea",
    accepts: [{ kind: "texto", label: "De qué parte", required: false }],
    produces: "texto",
    note: "Un encargo escrito a mano, con la opción de que un modelo lo mejore.",
  },
  {
    id: "imagen",
    label: "Imagen",
    group: "produccion",
    accepts: [
      { kind: "texto", label: "Prompt", required: true },
      { kind: "imagen", label: "Referencias", required: false, many: true },
    ],
    produces: "imagen",
    note: "Un fotograma o una foto de producto, con las referencias que le pases.",
  },
  {
    id: "clip",
    label: "Clip de vídeo",
    group: "produccion",
    accepts: [
      { kind: "texto", label: "Prompt", required: true },
      { kind: "imagen", label: "Imagen de partida", required: false, many: true },
    ],
    produces: "video",
    note: "Anima una imagen, o genera desde el texto si el modelo lo admite.",
  },
  {
    id: "anuncio",
    label: "Anuncio completo",
    group: "produccion",
    accepts: [
      { kind: "guion", label: "Guion", required: true },
      { kind: "imagen", label: "Referencias", required: false, many: true },
    ],
    produces: "video",
    note: "Seedance de principio a fin: el guion entero y hasta nueve referencias, con sonido.",
  },
  {
    id: "voz",
    label: "Voz",
    group: "produccion",
    accepts: [{ kind: "guion", label: "Qué se dice", required: true }],
    produces: "audio",
    note: "La locución, con su tono y sus tiempos por palabra.",
  },
  {
    id: "musica",
    label: "Música",
    group: "produccion",
    accepts: [{ kind: "texto", label: "Qué suena", required: false }],
    produces: "audio",
    note: "La cama de fondo, ya al volumen que no tapa la voz.",
  },
  {
    id: "montaje",
    label: "Montaje",
    group: "montaje",
    accepts: [
      { kind: "video", label: "Planos", required: true, many: true },
      { kind: "audio", label: "Voz y música", required: false, many: true },
      { kind: "guion", label: "Para los subtítulos", required: false },
    ],
    produces: "video",
    note: "Pega los planos, la voz y la música, y quema los subtítulos.",
  },
];

export function findNodeType(id: string): NodeType | null {
  return NODE_TYPES.find((type) => type.id === id) ?? null;
}

/* --------------------------------- El grafo -------------------------------- */

export interface FlowNode {
  id: string;
  type: string;
  /** Dónde está en el lienzo. No afecta a la ejecución. */
  x: number;
  y: number;
  /** Los ajustes de ese nodo: el modelo, los segundos, el texto… */
  settings: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
  /** A qué entrada del destino llega, por su índice. */
  port: number;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Problem {
  nodeId: string;
  problem: string;
}

/**
 * Si una conexión se puede hacer.
 *
 * Se comprueba **antes de dibujarla**, no al ejecutar: una conexión imposible
 * dibujada es una promesa que se rompe cinco minutos después, con el flujo ya
 * lanzado y pagado.
 */
export function canConnect(
  flow: Flow,
  from: string,
  to: string,
  port: number,
): { ok: boolean; why: string } {
  if (from === to) return { ok: false, why: "Un nodo no se conecta consigo mismo." };

  const source = flow.nodes.find((node) => node.id === from);
  const target = flow.nodes.find((node) => node.id === to);

  if (!source || !target) return { ok: false, why: "Uno de los dos nodos ya no existe." };

  const sourceType = findNodeType(source.type);
  const targetType = findNodeType(target.type);

  if (!sourceType || !targetType) return { ok: false, why: "Ese tipo de nodo no existe." };

  const input = targetType.accepts[port];
  if (!input) return { ok: false, why: "Ese nodo no tiene esa entrada." };

  if (input.kind !== sourceType.produces) {
    return {
      ok: false,
      why: `«${sourceType.label}» produce ${sourceType.produces} y «${input.label}» espera ${input.kind}.`,
    };
  }

  // Una entrada que no admite varias ya ocupada: se sustituye, no se acumula.
  if (!input.many && flow.edges.some((edge) => edge.to === to && edge.port === port)) {
    return { ok: false, why: `«${input.label}» ya tiene una conexión y solo admite una.` };
  }

  if (flow.edges.some((edge) => edge.from === from && edge.to === to && edge.port === port)) {
    return { ok: false, why: "Esa conexión ya existe." };
  }

  /*
   * Y que no cierre un ciclo.
   *
   * Un ciclo no da error al dibujarlo: da un flujo que no se puede ordenar y que
   * al ejecutar se queda esperando a un nodo que espera al primero. Se detecta
   * aquí, que es cuando todavía se puede explicar cuál es.
   */
  if (reaches(flow, to, from)) {
    return { ok: false, why: "Eso cerraría un círculo: ese nodo ya depende de este." };
  }

  return { ok: true, why: "" };
}

/** Si desde `start` se llega a `target` siguiendo las conexiones. */
function reaches(flow: Flow, start: string, target: string): boolean {
  const seen = new Set<string>();
  const pending = [start];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const edge of flow.edges) {
      if (edge.from === current) pending.push(edge.to);
    }
  }

  return false;
}

/**
 * Qué le falta al flujo para poder ejecutarse.
 *
 * Devuelve **todos** los problemas, no el primero: quien está montando un flujo
 * quiere arreglarlos de una pasada, y de uno en uno son cinco vueltas para lo
 * que se ve de golpe.
 */
export function validate(flow: Flow): Problem[] {
  const problems: Problem[] = [];

  for (const node of flow.nodes) {
    const type = findNodeType(node.type);

    if (!type) {
      problems.push({ nodeId: node.id, problem: `«${node.type}» no es un tipo de nodo.` });
      continue;
    }

    for (const [index, input] of type.accepts.entries()) {
      if (!input.required) continue;

      const connected = flow.edges.some((edge) => edge.to === node.id && edge.port === index);
      if (!connected) {
        problems.push({
          nodeId: node.id,
          problem: `A «${type.label}» le falta ${input.label.toLowerCase()}.`,
        });
      }
    }
  }

  if (flow.nodes.length > 0 && order(flow) === null) {
    problems.push({
      nodeId: flow.nodes[0].id,
      problem: "El flujo tiene un círculo: hay nodos esperándose entre ellos.",
    });
  }

  return problems;
}

/**
 * En qué orden hay que ejecutar los nodos.
 *
 * Orden topológico: cada nodo va después de todos los que le dan entrada.
 * Devuelve `null` si hay un ciclo — que no es un orden malo, es que no existe
 * ninguno.
 *
 * Con empates se respeta el orden en que están escritos los nodos. Da igual para
 * el resultado y hace que dos ejecuciones del mismo flujo lancen las cosas en el
 * mismo orden, que al mirar el progreso se agradece.
 */
export function order(flow: Flow): string[] | null {
  const pending = new Map(flow.nodes.map((node) => [node.id, 0]));

  for (const edge of flow.edges) {
    if (pending.has(edge.to)) pending.set(edge.to, (pending.get(edge.to) ?? 0) + 1);
  }

  const out: string[] = [];
  const ready = flow.nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);

  while (ready.length > 0) {
    const current = ready.shift()!;
    out.push(current);

    for (const edge of flow.edges) {
      if (edge.from !== current) continue;

      const left = (pending.get(edge.to) ?? 0) - 1;
      pending.set(edge.to, left);
      if (left === 0) ready.push(edge.to);
    }
  }

  return out.length === flow.nodes.length ? out : null;
}

/**
 * Qué nodos pueden correr ya, dados los que están hechos.
 *
 * Es lo que permite ejecutar en paralelo lo que no depende entre sí: dos
 * imágenes de dos ramas distintas no tienen por qué esperarse, y en una tanda de
 * veinte eso es la diferencia entre dos minutos y veinte.
 */
export function readyNow(flow: Flow, done: Set<string>): string[] {
  return flow.nodes
    .filter((node) => !done.has(node.id))
    .filter((node) =>
      flow.edges.filter((edge) => edge.to === node.id).every((edge) => done.has(edge.from)),
    )
    .map((node) => node.id);
}

/** Lo que entra en un nodo, agrupado por puerto y en el orden de las conexiones. */
export function inputsOf(flow: Flow, nodeId: string): Map<number, string[]> {
  const inputs = new Map<number, string[]>();

  for (const edge of flow.edges) {
    if (edge.to !== nodeId) continue;
    inputs.set(edge.port, [...(inputs.get(edge.port) ?? []), edge.from]);
  }

  return inputs;
}

/** Quita un nodo y las conexiones que colgaban de él. */
export function removeNode(flow: Flow, nodeId: string): Flow {
  return {
    nodes: flow.nodes.filter((node) => node.id !== nodeId),
    // Sin esto quedan conexiones apuntando a un nodo que no existe, y el orden
    // topológico las cuenta como dependencias que nunca se cumplen.
    edges: flow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  };
}
