"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { FlowNodeBox } from "@/components/flow/flow-node";
import { NodeSettings } from "@/components/flow/node-settings";
import { previewOf, summaryOf } from "@/components/flow/node-view";
import type { FlowNodeData } from "@/components/flow/flow-node";
import { CloneGuide } from "@/components/flow/clone-guide";
import {
  NODE_TYPES,
  canConnect,
  findNodeType,
  progressOf,
  removeNode,
  runStates,
  validate,
  type Flow,
} from "@/lib/flow/graph";
import { costLabel, flowCost } from "@/lib/flow/cost";
import {
  buildFlowAction,
  cloneFlowAction,
  flowProgressAction,
  lastFrameAction,
  runFlowAction,
  saveFlowAction,
} from "@/app/flujos/actions";
import { VOICE_CHOICES } from "@/lib/flow/clone";

/**
 * El lienzo.
 *
 * ## Lo que aporta y lo que no
 *
 * Dibuja y ordena. **Toda la regla de qué se puede conectar con qué vive en
 * `flow/graph.ts`**, no aquí: lo que decide si un flujo tiene sentido son datos,
 * y datos se pueden probar sin navegador. Aquí solo se pregunta.
 *
 * Esa separación es la que evita el fallo típico de un editor visual: que la
 * pantalla deje hacer algo que el ejecutor no sabe hacer.
 *
 * ## Guardar y ejecutar son dos botones
 *
 * Dibujar es gratis y ejecutar cuesta. Con un solo botón, cada arrastre se
 * arriesga a lanzar diez generaciones.
 */

/** Los grupos, en el orden en el que se construye un flujo. */
const GROUPS = [
  { id: "fuente", label: "De dónde sale" },
  { id: "idea", label: "La idea" },
  { id: "produccion", label: "Se genera" },
  { id: "montaje", label: "Montaje" },
] as const;

export interface FlowCanvasProps {
  flowId: string;
  graph: Flow;
  /** Lo que produjo la última ejecución, por nodo. */
  results: Record<string, { url: string; kind: string; error: string }>;
  avatars: { id: string; name: string; url: string }[];
  voices: { id: string; name: string }[];
  /** Los del CLI, para crear una cara sin salir del lienzo. */
  cliModels: { slug: string; name: string }[];
  /** Por qué no hay modelos, si no los hay. */
  cliModelsError: string;
  /** Los de vídeo de Higgsfield, para los nodos de clip. */
  cliVideoModels: { slug: string; name: string }[];
  /** Las del producto del flujo, para usarlas de referencia sin subirlas otra vez. */
  productImages: { url: string; name: string; primary: boolean }[];
  /** Los anuncios ya analizados, para poder clonar su construcción. */
  references: {
    id: string;
    name: string;
    seconds: number;
    beats: number;
    hadAudio: boolean;
    /** Cuántos fotogramas guardó: sin ellos se clona la estructura, no los encuadres. */
    frames: number;
  }[];
  /** Los copys que ya funcionaron y los ángulos investigados de este producto. */
  copyReferences: { id: string; kind: "copy" | "angulo"; label: string; text: string }[];
  /** El producto del flujo, para enlazar a su ficha desde la guía. */
  productId?: string;
}

const nodeTypes = { caja: FlowNodeBox };

/** Un identificador corto y legible: `imagen-3`, no un UUID de treinta letras. */
function nextId(nodes: Node[], type: string): string {
  const used = nodes.filter((node) => node.id.startsWith(`${type}-`)).length;
  return `${type}-${used + 1}`;
}

export function FlowCanvas({
  flowId,
  graph,
  results,
  avatars,
  voices,
  cliModels,
  cliModelsError,
  cliVideoModels,
  productImages,
  references,
  copyReferences,
  productId,
}: FlowCanvasProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [multiply, setMultiply] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>("");
  const [showCost, setShowCost] = useState(false);
  /** Si hay una ejecución viva: mientras la haya, se sondea. */
  const [running, setRunning] = useState(false);
  const [faces, setFaces] = useState(avatars);
  /** Lo que ha producido cada nodo. Aparte de las cajas, para poder deducir el avance. */
  const [outputs, setOutputs] = useState(results);
  /*
   * El grafo que está corriendo, congelado al lanzarlo.
   *
   * No vale el que se está editando: mover una caja o añadir un nodo mientras
   * corre cambiaría el orden y con él quién es «el que va ahora». Y tampoco vale
   * el guardado que llegó con la página, que para entonces ya es viejo.
   */
  const [ranGraph, setRanGraph] = useState<Flow>(graph);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    graph.nodes.map((node) => ({
      id: node.id,
      type: "caja",
      position: { x: node.x, y: node.y },
      data: {
        type: node.type,
        summary: summaryOf(node.type, node.settings),
        preview: previewOf(node.type, node.settings),
        settings: node.settings,
        result: results[node.id],
      },
    })),
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    graph.edges.map((edge) => ({
      id: `${edge.from}-${edge.to}-${edge.port}`,
      source: edge.from,
      target: edge.to,
      targetHandle: String(edge.port),
    })),
  );

  /** El grafo tal y como lo entiende el modelo, para preguntarle y para guardar. */
  const asFlow = useMemo<Flow>(
    () => ({
      nodes: nodes.map((node) => ({
        id: node.id,
        type: String((node.data as { type?: string }).type ?? ""),
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        settings: ((node.data as { settings?: Record<string, unknown> }).settings ?? {}),
      })),
      edges: edges.map((edge) => ({
        from: edge.source,
        to: edge.target,
        port: Number(edge.targetHandle ?? 0),
      })),
    }),
    [nodes, edges],
  );

  const problems = useMemo(() => validate(asFlow), [asFlow]);
  /** Cuántos pasos hay hechos de la última vuelta, para saber qué ofrecer. */
  const done = Object.values(outputs).filter((output) => output && !output.error).length;

  /*
   * Lo que cuesta lo que falta, y lo que costaría todo.
   *
   * Los dos, porque son los dos botones: continuar paga lo que queda y empezar
   * de cero lo paga todo otra vez. Enseñar solo uno deja el otro a ciegas.
   */
  const hechos = useMemo(
    () => new Set(Object.entries(outputs).filter(([, o]) => o && !o.error).map(([id]) => id)),
    [outputs],
  );

  const pending = useMemo(() => flowCost(asFlow, hechos), [asFlow, hechos]);
  const whole = useMemo(() => flowCost(asFlow), [asFlow]);
  const selectedNode = nodes.find((node) => node.id === selected) ?? null;

  /*
   * El avance se pinta sin recargar.
   *
   * Se pide **solo lo que cambia** —qué produjo cada nodo— y se mete en las
   * cajas que ya están. Recargar la página devolvería el grafo guardado y
   * pisaría lo que se esté editando: cajas movidas, ajustes a medio poner.
   *
   * El sondeo se para solo cuando la ejecución deja de estar viva, así que una
   * pestaña abierta toda la tarde no pregunta cada tres segundos para nada.
   */
  useEffect(() => {
    if (!running) return;

    let alive = true;

    const tick = async () => {
      const progress = await flowProgressAction(flowId);
      if (!alive) return;

      setFaces(progress.avatars);
      setOutputs(progress.outputs);

      if (progress.status && progress.status !== "corriendo") {
        setRunning(false);
        setNote(progress.note || "Ejecución terminada.");
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [running, flowId, setNodes]);

  /**
   * En qué anda cada nodo, deducido de lo que ya ha producido.
   *
   * Se calcula sobre el grafo congelado y no sobre el que se edita: si no, cada
   * arrastre recalcularía el avance y el efecto de abajo entraría en bucle.
   */
  const states = useMemo(() => runStates(ranGraph, outputs, running), [ranGraph, outputs, running]);
  const progress = useMemo(() => progressOf(states), [states]);

  /*
   * Lo que ha salido y en qué anda, en cada caja.
   *
   * Va en un efecto y no en el sondeo porque son dos cosas distintas: el sondeo
   * trae datos y esto los reparte. Antes solo se repartía el resultado, así que
   * un flujo de doce nodos ejecutándose se veía **igual** que uno parado hasta
   * que empezaban a aparecer imágenes.
   */
  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, result: outputs[node.id], state: states.get(node.id) },
      })),
    );
  }, [outputs, states, setNodes]);

  /*
   * La conexión la autoriza el modelo, no el lienzo.
   *
   * Es lo que impide dibujar algo que el ejecutor no sabe hacer: conectar música
   * a la entrada de referencias de un generador no daría error al ejecutar,
   * mandaría un campo que el modelo ignora.
   */
  const onConnect = useCallback(
    (connection: Connection) => {
      const port = Number(connection.targetHandle ?? 0);
      const verdict = canConnect(asFlow, connection.source, connection.target, port);

      if (!verdict.ok) {
        setNote(verdict.why);
        return;
      }

      setNote("");
      setEdges((current) => addEdge({ ...connection, id: `${connection.source}-${connection.target}-${port}` }, current));
    },
    [asFlow, setEdges],
  );

  const addNode = (type: string) => {
    const id = nextId(nodes, type);

    setNodes((current) => [
      ...current,
      {
        id,
        type: "caja",
        // En diagonal desde el último: apilarlos en el mismo punto obliga a
        // separarlos a mano antes de poder trabajar.
        position: { x: 80 + current.length * 40, y: 80 + current.length * 30 },
        data: { type, summary: "", settings: {} },
      },
    ]);
  };

  /**
   * Seguir desde el final de un vídeo.
   *
   * ## Qué construye y por qué así
   *
   * El fotograma final entra como **ancla**: un nodo de imagen que alimenta lo
   * que venga después. Es lo que mantiene la misma persona, la misma ropa y el
   * mismo sitio en el plano siguiente. Sin ancla, el clip que sigue empieza de
   * cero y sale otra cara — es el fallo que obliga a repetir el anuncio entero.
   *
   * Las tres salidas montan cadenas distintas porque son tres preguntas
   * distintas:
   *
   * - **Más vídeo** — ancla + prompt + clip. Se continúa la escena.
   * - **Cambiar la voz** — voz + lipsync sobre este mismo vídeo. No hay ancla:
   *   el vídeo no se regenera, se le cambia la boca.
   * - **Traducir** — igual que la anterior, con el guion en otro idioma.
   *
   * Los nodos se dejan **sin ejecutar**: se colocan, se conectan y se editan
   * antes de pagar nada. Un botón que además generase costaría dinero por un
   * clic que era para ver qué pasaba.
   */
  const continueFrom = async (nodeId: string, mode: "mas" | "voz" | "traducir") => {
    const source = nodes.find((node) => node.id === nodeId);
    const url = (source?.data as FlowNodeData | undefined)?.result?.url ?? "";

    if (!url) {
      setNote("Ese nodo todavía no tiene vídeo.");
      return;
    }

    const base = source?.position ?? { x: 80, y: 80 };
    const made: Node[] = [];
    const wires: Edge[] = [];

    const put = (type: string, dx: number, dy: number, settings: Record<string, unknown> = {}) => {
      const id = nextId([...nodes, ...made], type);

      made.push({
        id,
        type: "caja",
        position: { x: base.x + dx, y: base.y + dy },
        data: { type, summary: summaryOf(type, settings), preview: previewOf(type, settings), settings },
      });

      return id;
    };

    const wire = (from: string, to: string, port: number) => {
      wires.push({ id: `${from}-${to}-${port}`, source: from, target: to, targetHandle: String(port) });
    };

    if (mode === "mas") {
      setNote("Sacando el último fotograma…");

      const frame = await lastFrameAction(url);

      if (!frame.url) {
        setNote(frame.message);
        return;
      }

      const anchor = put("archivo", 280, -60, { url: frame.url, name: "Último fotograma" });
      const prompt = put("prompt", 280, 60, { text: "Sigue desde aquí: " });
      const clip = put("clip", 540, 0, { seconds: 6, aspectRatio: "9:16" });

      wire(prompt, clip, 0);
      wire(anchor, clip, 1);

      setNote("Listo: el fotograma final es el ancla del clip nuevo. Escribe qué pasa después.");
    } else {
      const guion = put("prompt", 280, 60, {
        text:
          mode === "traducir"
            ? "Traduce esto y mantén el ritmo y las pausas: "
            : "Lo que dice, con la voz nueva: ",
      });

      const voz = put("voz", 540, 60);
      const labios = put("labios", 800, 0, { model: "lipsync-2", syncMode: "remap" });

      wire(guion, voz, 0);
      wire(nodeId, labios, 0);
      wire(voz, labios, 1);

      setNote(
        mode === "traducir"
          ? "Listo: escribe la traducción, elige la voz y el lipsync la pone en la boca."
          : "Listo: escribe el texto, elige la voz y el lipsync la pone en la boca.",
      );
    }

    setNodes((current) => [...current, ...made]);
    setEdges((current) => [...current, ...wires]);
  };

  /**
   * Varias imágenes de golpe, cada una en su nodo.
   *
   * Un anuncio de una pieza admite hasta nueve referencias: ponerlas de una en
   * una son nueve nodos creados a mano y nueve paneles abiertos.
   */
  const addImages = (images: { url: string; name: string }[]) => {
    setNodes((current) => {
      const base = current.filter((node) => node.id.startsWith("archivo-")).length;

      return [
        ...current,
        ...images.map((image, index) => ({
          id: `archivo-${base + index + 1}`,
          type: "caja",
          position: { x: 60, y: 60 + (current.length + index) * 120 },
          data: {
            type: "archivo",
            summary: image.name,
            preview: { url: image.url, text: "" },
            settings: { url: image.url, name: image.name },
          },
        })),
      ];
    });
  };

  /** Pinta un grafo entero encima del actual. */
  const applyGraph = (graph: Flow) => {
    setNodes(
      graph.nodes.map((node) => ({
        id: node.id,
        type: "caja",
        position: { x: node.x, y: node.y },
        data: {
          type: node.type,
          summary: summaryOf(node.type, node.settings),
          preview: previewOf(node.type, node.settings),
          settings: node.settings,
        },
      })),
    );

    setEdges(
      graph.edges.map((edge) => ({
        id: `${edge.from}-${edge.to}-${edge.port}`,
        source: edge.from,
        target: edge.to,
        targetHandle: String(edge.port),
      })),
    );

    setSelected("");
  };

  const save = () => {
    setSaving(true);

    void saveFlowAction(flowId, asFlow)
      .then((result) => setNote(result.message))
      .finally(() => setSaving(false));
  };

  /** Un juego de variables por avatar marcado: eso es «varios anuncios». */
  const variants = [...multiply].map((id) => ({ avatar: id }));

  return (
    <div className="space-y-3">
      {/*
        Los nodos, en botones y no en una lista.

        Un desplegable esconde el catálogo entero detrás de un clic y obliga a
        leer trece líneas para encontrar una: montar un flujo son diez o doce
        nodos, o sea diez o doce veces abrir, buscar y elegir. En botones se ve
        todo lo que hay y se añade de un toque, que es lo que se hace de verdad.

        Van agrupados por lo que son —de dónde sale el material, la idea, lo que
        se genera, el montaje— porque ese es el orden en el que se construye.
      */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-2xl border border-slate-200 p-2 dark:border-slate-800">
        {GROUPS.map((group) => (
          <div key={group.id} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{group.label}</p>

            <div className="flex flex-wrap gap-1">
              {NODE_TYPES.filter((type) => type.group === group.id).map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => addNode(type.id)}
                  title={type.note}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-violet-600 dark:hover:bg-violet-950/40"
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          La última imagen que salió, sin ir a buscarla.

          Encadenar planos es coger la imagen del nodo anterior y meterla en el
          siguiente, y con doce cajas eso es abrir paneles hasta dar con la
          buena. Esto la trae directa: se busca de derecha a izquierda porque un
          lienzo se construye hacia la derecha y la última es la de más allá.
        */}
        <Button
          variant="ghost"
          onClick={() => {
            const withImage = nodes
              .filter((node) => {
                const data = node.data as FlowNodeData;
                return data.result?.kind === "imagen" || Boolean(data.preview?.url);
              })
              .sort((a, b) => b.position.x - a.position.x);

            const last = withImage[0];

            if (!last) {
              setNote("Todavía no hay ninguna imagen en el lienzo.");
              return;
            }

            const data = last.data as FlowNodeData;
            const url = data.result?.url || data.preview?.url || "";
            const id = nextId(nodes, "archivo");

            setNodes((current) => [
              ...current,
              {
                id,
                type: "caja",
                position: { x: last.position.x + 280, y: last.position.y },
                data: {
                  type: "archivo",
                  summary: "última imagen",
                  preview: { url, text: "" },
                  settings: { url, name: "Última imagen" },
                },
              },
            ]);

            setSelected(id);
            setNote("Puesta en un nodo nuevo, lista para conectar.");
          }}
        >
          Última imagen
        </Button>

        <Button disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar el flujo"}
        </Button>

        {/*
          Continuar y empezar de cero son dos botones.

          Antes solo había uno y siempre lo hacía todo desde el principio: con
          nueve nodos hechos y el décimo caído, arreglarlo costaba volver a pagar
          los nueve. Ahora lo normal es continuar —se reutiliza lo que salió— y
          empezar de cero es una decisión que se toma a propósito.
        */}
        <GenerateButton
          variant="primary"
          action={async () => {
            // Guardar antes de ejecutar: se ejecuta lo guardado, y lanzar lo que
            // hay en pantalla sin guardarlo produce un anuncio de otro grafo.
            await saveFlowAction(flowId, asFlow);

            const launched = await runFlowAction({ flowId, variants });

            if (launched.started) {
              // Lo que corre es esto, no lo que se edite a partir de ahora.
              setRanGraph(asFlow);
              setRunning(true);
            }

            return launched;
          }}
          label={
            variants.length > 1
              ? `Ejecutar ${variants.length} veces`
              : done > 0
                ? `Continuar (${done} hechos)`
                : "Ejecutar"
          }
          disabled={problems.length > 0}
          disabledReason={problems.length > 0 ? problems[0].problem : undefined}
          hint="Reutiliza lo que ya salió de la última vuelta y solo paga lo que falta. Va en segundo plano: verás cada nodo llenarse aquí mismo."
        />

        {done > 0 ? (
          <GenerateButton
            action={async () => {
              if (!window.confirm(`Esto vuelve a generar los ${done} pasos ya hechos. ¿Sigo?`)) {
                return { started: false as const, message: "No se lanzó nada." };
              }

              await saveFlowAction(flowId, asFlow);
              const launched = await runFlowAction({ flowId, variants, fresh: true });

              if (launched.started) {
                setOutputs({});
                setRanGraph(asFlow);
                setRunning(true);
              }

              return launched;
            }}
            label="Empezar de cero"
            disabled={problems.length > 0}
            hint="No hereda nada de la vuelta anterior. Se paga todo otra vez."
          />
        ) : null}

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {nodes.length} nodo(s) · {edges.length} conexión(es)
        </span>
      </div>

      {/*
        Lo que cuesta, antes de pulsar.

        Un lienzo de doce nodos puede costar unos céntimos o varios dólares según
        qué generador tenga cada caja, y eso no se ve mirando el dibujo. Pulsar
        «ejecutar» sin saberlo es descubrir el precio en la factura.
      */}
      {pending.steps > 0 || whole.steps > 0 ? (
        <div className="rounded-2xl border border-slate-200 p-2 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              <span className="font-medium">{costLabel(pending)}</span>
              {done > 0 && whole.usd !== pending.usd ? (
                <span className="text-slate-500 dark:text-slate-400">
                  {" "}
                  De cero serían {whole.usd.toFixed(2)} USD.
                </span>
              ) : null}
            </p>

            <button
              type="button"
              onClick={() => setShowCost((value) => !value)}
              className="text-xs font-medium text-violet-700 dark:text-violet-300"
            >
              {showCost ? "Ocultar el desglose" : "Ver el desglose"}
            </button>
          </div>

          {/*
            La barra compara lo que falta con el flujo entero: es la forma de ver
            de un vistazo cuánto se está ahorrando por continuar en vez de
            empezar de cero.
          */}
          {whole.usd > 0 ? (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((pending.usd / whole.usd) * 100))}%` }}
              />
            </div>
          ) : null}

          {showCost ? (
            <ul className="mt-2 space-y-0.5 text-[11px]">
              {pending.items.map((item) => (
                <li key={item.nodeId} className="flex justify-between gap-2">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {item.nodeId} · {item.what}
                  </span>

                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {item.usd === null ? "sin confirmar" : `${item.usd.toFixed(2)} USD`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/*
        Multiplicar: el mismo flujo con otra cara.

        Es lo que convierte un flujo en varios anuncios. Las vueltas van en serie
        porque cada una lanza sus generaciones y el proveedor limita llamadas por
        minuto: seis a la vez no acaban antes, fallan por cupo.
      */}
      {faces.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 p-2 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Una vuelta por cada cara marcada {multiply.size > 0 ? `· ${multiply.size}` : "· ninguna"}
          </p>

          <ul className="mt-1 flex flex-wrap gap-1">
            {faces.map((avatar) => {
              const on = multiply.has(avatar.id);

              return (
                <li key={avatar.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setMultiply((current) => {
                        const next = new Set(current);
                        if (next.has(avatar.id)) next.delete(avatar.id);
                        else next.add(avatar.id);
                        return next;
                      })
                    }
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      on
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40"
                        : "border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    {avatar.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <CloneGuide productId={productId} />

      <AutoBuild
        flowId={flowId}
        references={references}
        copyReferences={copyReferences}
        // Sustituir lo que hay es destructivo y no se puede deshacer: si ya hay
        // trabajo en el lienzo, se pregunta.
        busy={running}
        onBuilt={(graph, message) => {
          if (
            nodes.length > 0 &&
            !window.confirm(`Esto sustituye los ${nodes.length} nodos que ya hay. ¿Sigo?`)
          ) {
            return false;
          }

          applyGraph(graph);
          setNote(message);
          return true;
        }}
      />

      {/*
        La barra, mientras corre y también al acabar.

        Al acabar sigue en pantalla a propósito: es donde se lee cuántos se
        cayeron sin tener que buscar caja por caja cuál tiene el borde rojo.
      */}
      {progress.total > 0 && (running || progress.done + progress.failed > 0) ? (
        <div className="rounded-2xl border border-slate-200 p-2 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium">
              {running ? "Ejecutando" : "Última ejecución"} · {progress.done + progress.failed} de{" "}
              {progress.total}
              {progress.failed > 0 ? ` · ${progress.failed} sin salir` : ""}
            </span>

            <span className="text-slate-500 dark:text-slate-400">
              {[...states.entries()].find(([, state]) => state === "ahora")?.[0] ?? ""}
              {note && running ? ` · ${note}` : ""}
            </span>
          </div>

          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress.failed > 0 ? "bg-amber-500" : "bg-violet-600"
              }`}
              style={{
                width: `${Math.round(((progress.done + progress.failed) / progress.total) * 100)}%`,
              }}
            />
          </div>

          {/*
            La lista de pasos, que es lo que se pidió: ver por dónde va sin
            tener que buscar la caja que late en un lienzo de veinte.
          */}
          <ol className="mt-2 space-y-0.5 text-[11px]">
            {ranGraph.nodes.map((node) => {
              const state = states.get(node.id);
              const type = findNodeType(node.type);

              return (
                <li key={node.id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-block size-1.5 shrink-0 rounded-full ${
                      state === "hecho"
                        ? "bg-emerald-500"
                        : state === "fallo"
                          ? "bg-rose-500"
                          : state === "ahora"
                            ? "animate-pulse bg-violet-600"
                            : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  />

                  <span
                    className={
                      state === "ahora"
                        ? "font-medium"
                        : state === "espera" || state === "parado"
                          ? "text-slate-400 dark:text-slate-500"
                          : "text-slate-600 dark:text-slate-300"
                    }
                  >
                    {type?.label ?? node.type} · {node.id}
                  </span>

                  {outputs[node.id]?.error ? (
                    <span className="truncate text-rose-700 dark:text-rose-400">
                      {outputs[node.id]?.error}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {note ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {note}
        </p>
      ) : null}

      {/*
        Lo que falta, mientras se monta y no al ejecutar.

        Un flujo incompleto falla en el nodo que necesita la entrada, no en el
        primero: descubrirlo a mitad son cinco generaciones pagadas para nada.
      */}
      {problems.length > 0 ? (
        <ul className="rounded-2xl border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {problems.map((problem, index) => (
            <li key={index}>· {problem.problem}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="h-[560px] rounded-2xl border border-slate-200 dark:border-slate-800">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelected(node.id)}
            onPaneClick={() => setSelected("")}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/*
          Los ajustes van al lado y no dentro de la caja: seis campos dentro
          dejan de ser un nodo y tapan las conexiones, que es justo lo que el
          lienzo venía a aportar.
        */}
        <div>
          {selectedNode ? (
            <NodeSettings
              nodeId={selectedNode.id}
              type={String((selectedNode.data as { type?: string }).type ?? "")}
              settings={
                ((selectedNode.data as { settings?: Record<string, unknown> }).settings ?? {})
              }
              voices={voices}
              avatars={faces}
              cliModels={cliModels}
              cliModelsError={cliModelsError}
              cliVideoModels={cliVideoModels}
              hasVideo={Boolean(
                (selectedNode?.data as FlowNodeData | undefined)?.result?.url &&
                  (selectedNode?.data as FlowNodeData | undefined)?.result?.kind === "video",
              )}
              onContinue={(mode) => {
                void continueFrom(selected, mode);
              }}
              productImages={productImages}
              copyReferences={copyReferences}
              onFacesChanged={() => setRunning(true)}
              onAddImages={addImages}
              /*
                Rehacer **este** paso.

                Se arrastra lo que colgaba de él: volver a generar la imagen sin
                tirar el clip que salió de ella daría un montaje con la imagen
                vieja dentro, y eso no se ve hasta reproducirlo.
              */
              onRedo={
                outputs[selected]
                  ? async () => {
                      await saveFlowAction(flowId, asFlow);
                      const launched = await runFlowAction({ flowId, redo: [selected] });

                      if (launched.started) {
                        setRanGraph(asFlow);
                        setRunning(true);
                      }

                      return launched;
                    }
                  : undefined
              }
              onChange={(settings) =>
                setNodes((current) =>
                  current.map((node) =>
                    node.id === selected
                      ? {
                          ...node,
                          data: {
                            ...node.data,
                            settings,
                            summary: summaryOf(
                              String((node.data as { type?: string }).type ?? ""),
                              settings,
                            ),
                            // Lo elegido se ve **ya**, no al ejecutar: sin esto,
                            // elegir una foto no cambiaba nada en pantalla y la
                            // única forma de comprobarlo era ejecutar el flujo.
                            preview: previewOf(
                              String((node.data as { type?: string }).type ?? ""),
                              settings,
                            ),
                          },
                        }
                      : node,
                  ),
                )
              }
              /*
                Duplicar.

                Un flujo de seis tomas son seis nodos de prompt y seis de clip
                con los mismos ajustes: el generador, los segundos, la forma.
                Ponerlos uno a uno es teclear doce veces lo mismo, y basta con
                que uno salga distinto para que el anuncio no cuadre.

                Se copia el nodo con sus ajustes pero **sin sus conexiones**:
                heredarlas lo dejaría colgando de las mismas entradas, que casi
                nunca es lo que se quiere y además se lleva la entrada única del
                destino.
              */
              onDuplicate={() => {
                const source = nodes.find((node) => node.id === selected);
                if (!source) return;

                const type = String((source.data as { type?: string }).type ?? "");
                const id = nextId(nodes, type);

                setNodes((current) => [
                  ...current,
                  {
                    ...source,
                    id,
                    position: { x: source.position.x + 60, y: source.position.y + 60 },
                    data: { ...source.data, result: undefined, state: undefined },
                    selected: false,
                  },
                ]);

                setSelected(id);
              }}
              onDelete={() => {
                // Por el modelo, que se lleva también las conexiones: dejarlas
                // sueltas cuenta como dependencias que nunca se cumplen.
                const next = removeNode(asFlow, selected);

                setNodes((current) => current.filter((node) => node.id !== selected));
                setEdges(() =>
                  next.edges.map((edge) => ({
                    id: `${edge.from}-${edge.to}-${edge.port}`,
                    source: edge.from,
                    target: edge.to,
                    targetHandle: String(edge.port),
                  })),
                );
                setSelected("");
              }}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Pulsa un nodo para configurarlo. Sin ajustes, cada uno usa lo que tenga por defecto —
              y los que necesitan algo (una voz, una cara) fallarán al ejecutar diciéndolo.
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Arrastra desde el punto de la derecha de un nodo hasta la entrada de otro. Los colores
        dicen qué encaja: solo se unen dos puntos del mismo color. Borra un nodo seleccionándolo y
        pulsando Supr.
      </p>

      {running ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ejecutando… los resultados aparecen en cada caja según van saliendo. Puedes cerrar la
          pestaña: sigue en segundo plano.
        </p>
      ) : (
        <Button variant="ghost" onClick={() => router.refresh()}>
          Traer la última ejecución
        </Button>
      )}
    </div>
  );
}

/** Una línea que diga qué hay dentro sin abrirlo. */
/**
 * Que lo monte la IA y luego lo edites tú.
 *
 * ## Por qué devuelve el plano y no el anuncio
 *
 * Porque el punto de edición tiene que estar **antes** de pagar. Un botón de
 * «hazme un anuncio» devuelve un vídeo terminado: si el ángulo no era ese, no
 * hay nada que corregir, solo que volver a lanzarlo entero. Esto llena el
 * lienzo —tomas, prompts, generadores, voz, montaje— sin generar un fotograma.
 * Se mira, se cambia lo que no encaja, y se ejecuta cuando convence.
 *
 * ## Y por qué se cuenta lo que se cayó
 *
 * El plan pasa por la misma regla que si lo hubiera dibujado una persona: una
 * conexión imposible se cae. Callárselo dejaría un flujo que no se parece a lo
 * que se pidió sin que nadie sepa por qué.
 */
function AutoBuild({
  flowId,
  references,
  copyReferences,
  busy,
  onBuilt,
}: {
  flowId: string;
  references: {
    id: string;
    name: string;
    seconds: number;
    beats: number;
    hadAudio: boolean;
    frames: number;
  }[];
  copyReferences: { id: string; kind: "copy" | "angulo"; label: string; text: string }[];
  busy: boolean;
  /** Devuelve si se aplicó: puede rechazarse para no pisar lo que ya hay. */
  onBuilt: (graph: Flow, message: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [shape, setShape] = useState("elige-tu");
  const [seconds, setSeconds] = useState(30);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState("");
  const [dropped, setDropped] = useState<string[]>([]);
  /** De qué parte: de una idea escrita o de un anuncio ya analizado. */
  const [source, setSource] = useState("idea");
  const [referenceId, setReferenceId] = useState("");
  const [voice, setVoice] = useState("auto");
  const [voiceNote, setVoiceNote] = useState("");
  /** El ángulo decidido y los copys probados de los que partir. */
  const [angleId, setAngleId] = useState("");
  const [copyIds, setCopyIds] = useState<Set<string>>(new Set());

  const reference = references.find((item) => item.id === referenceId) ?? null;
  const cloning = source === "clon";

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Que lo monte la IA
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-violet-300 p-3 dark:border-violet-900">
      <p className="text-sm font-medium">
        {cloning ? "Clonar un anuncio que funciona" : "Montar el flujo desde la idea"}
      </p>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {cloning
          ? "Copia la construcción del anuncio analizado —cuántas tomas, qué hace cada una, cada cuánto corta, dónde entra el producto— y rehace cada escena con el tuyo. No copia su texto ni sus imágenes: el vídeo ajeno no se guarda, solo cómo está hecho."
          : "Lee la investigación del producto y sus ángulos y deja el lienzo montado: tomas, prompts, generadores, voz y montaje. No genera nada — lo revisas y lo ejecutas tú."}
      </p>

      <div className="flex flex-wrap gap-1">
        {[
          { id: "idea", label: "Desde una idea" },
          { id: "clon", label: `Clonando un anuncio${references.length > 0 ? ` (${references.length})` : ""}` },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSource(option.id)}
            className={`rounded-lg border px-2 py-1 text-xs ${
              source === option.id
                ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40"
                : "border-slate-300 dark:border-slate-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {cloning ? (
        references.length === 0 ? (
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Todavía no has analizado ningún anuncio. Se hace en la ficha del producto, en «anuncios
            de referencia»: se sube el vídeo, se analiza y aquí aparece su construcción.
          </p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Cuál se clona</span>

            <SelectField
              value={referenceId}
              onChange={(event) => setReferenceId(event.target.value)}
            >
              <option value="">Elige uno…</option>
              {references.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {Math.round(item.seconds)} s · {item.beats} momento(s)
                  {item.frames > 0 ? ` · ${item.frames} fotogramas` : " · sin fotogramas"}
                  {item.hadAudio ? "" : " · sin voz"}
                </option>
              ))}
            </SelectField>
          </label>
        )
      ) : (
        <textarea
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          rows={3}
          placeholder="Una madre a las 6 de la mañana que ya no puede con el dolor de rodillas… (o déjalo vacío y que proponga el ángulo)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      )}

      {/*
        De qué partir, además de la idea.

        Es la diferencia entre «móntame un anuncio» y «móntame **este**
        anuncio»: con un ángulo decidido y los copys que ya convierten delante,
        el plano sale de lo que se sabe que funciona.
      */}
      {!cloning && copyReferences.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
          {copyReferences.some((item) => item.kind === "angulo") ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Por qué ángulo</span>

              <SelectField value={angleId} onChange={(event) => setAngleId(event.target.value)}>
                <option value="">Que elija ella entre los investigados</option>
                {copyReferences
                  .filter((item) => item.kind === "angulo")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </SelectField>
            </label>
          ) : null}

          {copyReferences.some((item) => item.kind === "copy") ? (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Copys que ya funcionaron, para partir de sus ganchos
                {copyIds.size > 0 ? ` · ${copyIds.size}` : ""}
              </p>

              <ul className="mt-1 flex flex-wrap gap-1">
                {copyReferences
                  .filter((item) => item.kind === "copy")
                  .map((item) => {
                    const on = copyIds.has(item.id);

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          title={item.text.slice(0, 200)}
                          onClick={() =>
                            setCopyIds((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                          className={`max-w-52 truncate rounded-lg border px-2 py-1 text-xs ${
                            on
                              ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40"
                              : "border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Cómo se hace</span>

          <SelectField value={shape} onChange={(event) => setShape(event.target.value)}>
            {/*
              Clonando no hay «que decida ella»: la forma cambia de dónde sale la
              voz, y esa decisión se toma aquí y se le impone al modelo.
            */}
            {cloning ? null : <option value="elige-tu">Que decida ella</option>}
            <option value="una-pieza">De una pieza (Seedance)</option>
            <option value="planos">Plano a plano, con montaje</option>
          </SelectField>
        </label>

        {/*
          De dónde sale la voz.

          Un generador de vídeo pone una voz **distinta en cada llamada**. Con el
          anuncio en una pieza da igual —una llamada, una voz—, pero con seis
          planos son seis llamadas y la persona cambia de voz a mitad de frase.
          No da error y no se descubre hasta reproducirlo entero, con los seis
          clips pagados.
        */}
        {cloning ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">La voz</span>

            <SelectField value={voice} onChange={(event) => setVoice(event.target.value)}>
              {VOICE_CHOICES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Segundos</span>

          <input
            type="number"
            min={10}
            max={120}
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <Button
          variant="primary"
          disabled={working || busy || (cloning && !referenceId)}
          onClick={() => {
            setWorking(true);
            setNote("");
            setDropped([]);

            const work = cloning
              ? cloneFlowAction({ flowId, referenceId, shape, seconds, voice })
              : buildFlowAction({ flowId, idea, shape, seconds, angleId, copyIds: [...copyIds] });

            void work
              .then((result) => {
                if (!result.ok || !result.graph) {
                  setNote(result.message);
                  return;
                }

                setDropped(result.dropped ?? []);

                // Por qué la voz salió de donde salió: es la decisión menos
                // obvia de todas y la que más cara sale si sorprende.
                const decision =
                  "voice" in result
                    ? (result.voice as { why: string; warning: string } | undefined)
                    : null;

                setVoiceNote(
                  decision ? [decision.why, decision.warning].filter(Boolean).join(" ") : "",
                );

                if (onBuilt(result.graph, result.message)) {
                  setNote("Montado. Revísalo y guárdalo si te sirve.");
                  setOpen(false);
                } else {
                  setNote("No se tocó nada.");
                }
              })
              .catch((error: unknown) =>
                setNote(error instanceof Error ? error.message : "No se pudo montar."),
              )
              .finally(() => setWorking(false));
          }}
        >
          {working ? (cloning ? "Clonando…" : "Montando…") : cloning ? "Clonar" : "Montar"}
        </Button>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}

      {voiceNote ? (
        <p className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <span className="font-medium">La voz:</span> {voiceNote}
        </p>
      ) : null}

      {reference && cloning ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {Math.round(reference.seconds)} segundos y {reference.beats} momentos. Por defecto el
          clon dura lo mismo: el mismo anuncio en la mitad de tiempo tendría que cortar el doble
          de rápido, y entonces ya no es el mismo anuncio.
          {reference.frames > 0
            ? ` Sus ${reference.frames} fotogramas entran como referencia de encuadre en las tomas donde importe.`
            : " Este análisis es anterior a que se guardaran los fotogramas: se clona su construcción, no sus encuadres. Vuelve a analizarlo si quieres también los encuadres."}
        </p>
      ) : null}

      {dropped.length > 0 ? (
        <div className="text-xs text-amber-800 dark:text-amber-300">
          <p>Del plan se cayeron {dropped.length} cosa(s):</p>

          <ul className="mt-1 space-y-0.5">
            {dropped.map((reason, index) => (
              <li key={index}>· {reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
