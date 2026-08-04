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
import { NODE_TYPES, canConnect, findNodeType, removeNode, validate, type Flow } from "@/lib/flow/graph";
import { flowProgressAction, runFlowAction, saveFlowAction } from "@/app/flujos/actions";

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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    graph.nodes.map((node) => ({
      id: node.id,
      type: "caja",
      position: { x: node.x, y: node.y },
      data: {
        type: node.type,
        summary: summaryOf(node.type, node.settings),
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

      setNodes((current) =>
        current.map((node) => {
          const result = progress.outputs[node.id];
          return result ? { ...node, data: { ...node.data, result } } : node;
        }),
      );

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
            if (launched.started) setRunning(true);

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
        : [get("text").slice(0, 40), get("model")];

  return pieces.filter(Boolean).join(" · ");
}
