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
import { buildFlowAction, flowProgressAction, runFlowAction, saveFlowAction } from "@/app/flujos/actions";

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

export interface FlowCanvasProps {
  flowId: string;
  graph: Flow;
  /** Lo que produjo la última ejecución, por nodo. */
  results: Record<string, { url: string; kind: string; error: string }>;
  avatars: { id: string; name: string; url: string }[];
  voices: { id: string; name: string }[];
  /** Los del CLI, para crear una cara sin salir del lienzo. */
  cliModels: { slug: string; name: string }[];
  /** Las del producto del flujo, para usarlas de referencia sin subirlas otra vez. */
  productImages: { url: string; name: string; primary: boolean }[];
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
  productImages,
}: FlowCanvasProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [multiply, setMultiply] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>("");
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
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          value=""
          onChange={(event) => {
            if (event.target.value) addNode(event.target.value);
          }}
          className="min-w-48"
        >
          <option value="">Añadir un nodo…</option>
          {NODE_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label} — {type.note.slice(0, 50)}
            </option>
          ))}
        </SelectField>

        <Button disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar el flujo"}
        </Button>

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
          label={variants.length > 1 ? `Ejecutar ${variants.length} veces` : "Ejecutar"}
          disabled={problems.length > 0}
          disabledReason={problems.length > 0 ? problems[0].problem : undefined}
          hint="Guarda solo y va en segundo plano: verás cada nodo llenarse aquí mismo. Lo ya hecho no se vuelve a pagar."
        />

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {nodes.length} nodo(s) · {edges.length} conexión(es)
        </span>
      </div>

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

      <AutoBuild
        flowId={flowId}
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
              productImages={productImages}
              onFacesChanged={() => setRunning(true)}
              onAddImages={addImages}
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
function summaryOf(type: string, settings: Record<string, unknown>): string {
  const node = findNodeType(type);
  if (!node) return "";

  const get = (key: string) => (typeof settings[key] === "string" ? (settings[key] as string) : "");

  // Lo que identifica ese nodo de un vistazo, que no es lo mismo en todos.
  const pieces =
    type === "archivo"
      ? [get("name") || (get("url") ? "imagen puesta" : "")]
      : type === "avatar"
        ? [get("avatarId") ? "cara fijada" : "la de cada vuelta"]
        : type === "copy"
          ? [get("format") || "anuncio"]
          : type === "anuncio"
            ? [get("model") || "seedance2", get("director")]
            : [get("text").slice(0, 40), get("model")];

  return pieces.filter(Boolean).join(" · ");
}

/**
 * Lo que ya está puesto en el nodo, para verlo sin ejecutar nada.
 *
 * Es la mitad visible de un fallo que costaba caro: elegir una foto del
 * producto en el panel no cambiaba nada en el lienzo, así que parecía que el
 * clic no había hecho nada — y la única forma de comprobar si estaba bien
 * elegida era ejecutar el flujo entero.
 */
function previewOf(
  type: string,
  settings: Record<string, unknown>,
): { url: string; text: string } | undefined {
  const get = (key: string) => (typeof settings[key] === "string" ? (settings[key] as string) : "");

  if (type === "archivo" && get("url")) return { url: get("url"), text: "" };
  if (type === "avatar" && get("avatarUrl")) return { url: get("avatarUrl"), text: "" };
  if (type === "prompt" && get("text")) return { url: "", text: get("text") };
  if (type === "copy" && get("angle")) return { url: "", text: get("angle") };
  if (type === "musica" && get("prompt")) return { url: "", text: get("prompt") };

  return undefined;
}

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
  busy,
  onBuilt,
}: {
  flowId: string;
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

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Que lo monte la IA
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-violet-300 p-3 dark:border-violet-900">
      <p className="text-sm font-medium">Montar el flujo desde la idea</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Lee la investigación del producto y sus ángulos y deja el lienzo montado: tomas, prompts,
        generadores, voz y montaje. No genera nada — lo revisas y lo ejecutas tú.
      </p>

      <textarea
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        rows={3}
        placeholder="Una madre a las 6 de la mañana que ya no puede con el dolor de rodillas… (o déjalo vacío y que proponga el ángulo)"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Cómo se hace</span>

          <SelectField value={shape} onChange={(event) => setShape(event.target.value)}>
            <option value="elige-tu">Que decida ella</option>
            <option value="una-pieza">De una pieza (Seedance)</option>
            <option value="planos">Plano a plano, con montaje</option>
          </SelectField>
        </label>

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
          disabled={working || busy}
          onClick={() => {
            setWorking(true);
            setNote("");
            setDropped([]);

            void buildFlowAction({ flowId, idea, shape, seconds })
              .then((result) => {
                if (!result.ok || !result.graph) {
                  setNote(result.message);
                  return;
                }

                setDropped(result.dropped ?? []);

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
          {working ? "Montando…" : "Montar"}
        </Button>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}

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
