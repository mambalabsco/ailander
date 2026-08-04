import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { Flow } from "@/lib/flow/graph";

/**
 * Flujos, ejecuciones y lo que produjo cada nodo.
 *
 * El flujo es el plano y no guarda resultados; cada ejecución guarda los suyos
 * **nodo a nodo**. Eso es lo que permite reanudar sin volver a pagar lo hecho, y
 * lo que permite mirar dónde se torció en vez de solo saber que no salió.
 */

export interface FlowRecord {
  id: string;
  name: string;
  productId: string;
  graph: Flow;
  updatedAt: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  status: "corriendo" | "hecho" | "error" | "cancelado";
  variables: Record<string, string>;
  note: string;
  createdAt: string;
}

export interface FlowOutput {
  nodeId: string;
  kind: string;
  url: string;
  value: string;
  error: string;
}

const EMPTY: Flow = { nodes: [], edges: [] };

/**
 * El grafo viene de una columna `jsonb`, así que puede ser cualquier cosa.
 *
 * Se valida en vez de confiar: un grafo a medias —nodos sin identificador,
 * conexiones apuntando a nada— recorre todo el ejecutor sin dar error hasta que
 * algo intenta usarlo, y ahí el mensaje ya no dice de dónde venía.
 */
function parseGraph(value: unknown): Flow {
  if (typeof value !== "object" || value === null) return EMPTY;

  const record = value as { nodes?: unknown; edges?: unknown };

  const nodes = Array.isArray(record.nodes)
    ? record.nodes.filter(
        (node): node is Flow["nodes"][number] =>
          typeof node === "object" &&
          node !== null &&
          typeof (node as { id?: unknown }).id === "string" &&
          typeof (node as { type?: unknown }).type === "string",
      )
    : [];

  const ids = new Set(nodes.map((node) => node.id));

  const edges = Array.isArray(record.edges)
    ? record.edges.filter(
        (edge): edge is Flow["edges"][number] =>
          typeof edge === "object" &&
          edge !== null &&
          // Una conexión a un nodo que ya no existe cuenta como dependencia que
          // nunca se cumple, y el flujo se queda esperando para siempre.
          ids.has((edge as { from?: unknown }).from as string) &&
          ids.has((edge as { to?: unknown }).to as string),
      )
    : [];

  return { nodes, edges };
}

export async function listFlows(): Promise<FlowRecord[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los flujos: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    productId: row.product_id,
    graph: parseGraph(row.graph),
    updatedAt: row.updated_at,
  }));
}

export async function readFlow(id: string): Promise<FlowRecord | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("flows").select("*").eq("id", id).maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    productId: data.product_id,
    graph: parseGraph(data.graph),
    updatedAt: data.updated_at,
  };
}

export async function createFlow(name: string, productId: string): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("flows")
    .insert({ user_id: userId, name: name || "Sin título", product_id: productId })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo crear el flujo: ${error.message}`);

  return data.id;
}

export async function saveGraph(id: string, graph: Flow): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("flows")
    .update({
      graph: graph as unknown as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo guardar el flujo: ${error.message}`);
}

export async function renameFlow(id: string, name: string, productId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("flows")
    .update({ name, product_id: productId, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
}

export async function deleteFlow(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("flows").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

/* ------------------------------- Ejecuciones ------------------------------- */

export async function startRun(
  flowId: string,
  variables: Record<string, string>,
): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("flow_runs")
    .insert({
      user_id: userId,
      flow_id: flowId,
      status: "corriendo",
      variables: variables as unknown as never,
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo empezar: ${error.message}`);

  return data.id;
}

export async function finishRun(
  runId: string,
  status: FlowRun["status"],
  note: string,
): Promise<void> {
  const { supabase } = await requireContext();

  await supabase
    .from("flow_runs")
    .update({ status, note, updated_at: new Date().toISOString() })
    .eq("id", runId);
}

export async function listRuns(flowId: string): Promise<FlowRun[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("flow_runs")
    .select("*")
    .eq("flow_id", flowId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((row) => ({
    id: row.id,
    flowId: row.flow_id,
    status: row.status as FlowRun["status"],
    variables: (row.variables ?? {}) as Record<string, string>,
    note: row.note,
    createdAt: row.created_at,
  }));
}

/**
 * Guarda lo que produjo un nodo.
 *
 * `upsert` por `(run_id, node_id)`: reanudar una ejecución vuelve a pasar por
 * nodos ya hechos y tiene que escribir encima, no acumular filas que después
 * habría que desempatar.
 */
export async function saveOutput(input: {
  runId: string;
  nodeId: string;
  kind: string;
  url?: string;
  value?: string;
  error?: string;
}): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("flow_outputs").upsert(
    {
      user_id: userId,
      run_id: input.runId,
      node_id: input.nodeId,
      kind: input.kind,
      url: input.url ?? "",
      value: input.value ?? "",
      error: input.error ?? "",
    },
    { onConflict: "run_id,node_id" },
  );

  if (error) throw new Error(`No se pudo guardar el resultado: ${error.message}`);
}

export async function listOutputs(runId: string): Promise<FlowOutput[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("flow_outputs").select("*").eq("run_id", runId);

  return (data ?? []).map((row) => ({
    nodeId: row.node_id,
    kind: row.kind,
    url: row.url,
    value: row.value,
    error: row.error,
  }));
}
