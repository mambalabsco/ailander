"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/permissions";
import { runInBackground } from "@/lib/background";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { validate, type Flow } from "@/lib/flow/graph";
import { runFlow, type NodeResult } from "@/lib/flow/run";
import {
  createFlow,
  deleteFlow,
  finishRun,
  listOutputs,
  readFlow,
  renameFlow,
  saveGraph,
  startRun,
} from "@/lib/data/flows";
import type { LaunchResult } from "@/types/jobs";

/**
 * Los flujos: montar un anuncio como un grafo y ejecutarlo.
 *
 * ## Por qué el guardado y la ejecución están separados
 *
 * Dibujar es gratis y ejecutar cuesta. Con un solo botón, cada vez que alguien
 * mueve una caja se arriesga a lanzar diez generaciones — y con veinte nodos eso
 * son varios dólares por un arrastre.
 */

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function guard() {
  await requireCapability("estudio");

  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
}

/**
 * El grafo llega del navegador, así que no se guarda tal cual.
 *
 * Un nodo sin identificador o una conexión a un nodo que no existe recorren todo
 * el ejecutor sin dar error hasta que algo intenta usarlos, y para entonces el
 * mensaje ya no dice de dónde venía.
 */
function readGraph(value: unknown): Flow {
  const raw = (value ?? {}) as { nodes?: unknown; edges?: unknown };

  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .filter((item) => readText(item.id) && readText(item.type))
    .map((item) => ({
      id: readText(item.id),
      type: readText(item.type),
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      settings:
        typeof item.settings === "object" && item.settings !== null
          ? (item.settings as Record<string, unknown>)
          : {},
    }));

  const ids = new Set(nodes.map((node) => node.id));

  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .filter((item) => ids.has(readText(item.from)) && ids.has(readText(item.to)))
    .map((item) => ({
      from: readText(item.from),
      to: readText(item.to),
      port: Number(item.port) || 0,
    }));

  return { nodes, edges };
}

/* --------------------------------- Flujos ---------------------------------- */

export async function createFlowAction(
  name: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    await guard();

    const id = await createFlow(readText(name), readText(productId));
    revalidatePath("/flujos");

    return { ok: true, message: "Flujo creado.", id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo crear." };
  }
}

export async function saveFlowAction(
  id: unknown,
  graph: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();
    await saveGraph(readText(id), readGraph(graph));

    revalidatePath("/flujos");
    return { ok: true, message: "Guardado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

export async function renameFlowAction(
  id: unknown,
  name: unknown,
  productId: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guard();
    await renameFlow(readText(id), readText(name) || "Sin título", readText(productId));

    revalidatePath("/flujos");
    return { ok: true, message: "Guardado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

export async function deleteFlowAction(id: unknown): Promise<void> {
  await guard();
  await deleteFlow(readText(id));
  revalidatePath("/flujos");
}

/* -------------------------------- Ejecutar --------------------------------- */

/**
 * Ejecuta el flujo, una vez por cada juego de variables.
 *
 * ## Lo de «generar varios anuncios»
 *
 * Es esto: el mismo flujo con otra cara o con otro ángulo. Las vueltas van en
 * serie porque cada una lanza sus propias generaciones y el proveedor limita
 * llamadas por minuto — seis vueltas a la vez no acaban antes, fallan por cupo.
 *
 * ## Y por qué se valida antes de empezar
 *
 * Un flujo al que le falta una entrada falla en el nodo que la necesita, no en
 * el primero. Descubrirlo a mitad son cinco generaciones pagadas para nada, así
 * que se comprueba lo que se puede comprobar sin gastar.
 */
export async function runFlowAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const flowId = readText(raw.flowId);

  if (!flowId) throw new Error("Falta el flujo.");

  await guard();

  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }

  const flow = await readFlow(flowId);
  if (!flow) throw new Error("Ese flujo ya no existe.");
  if (flow.graph.nodes.length === 0) throw new Error("El flujo está vacío.");

  const problems = validate(flow.graph);
  if (problems.length > 0) {
    throw new Error(`El flujo no está completo: ${problems.map((item) => item.problem).join(" ")}`);
  }

  /*
   * Cada juego de variables es una vuelta.
   *
   * Sin ninguno se ejecuta una vez con lo que tenga cada nodo fijado, que es el
   * caso normal. Con varios —un avatar por vuelta— sale un anuncio por cada uno.
   */
  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .map((item) =>
      Object.fromEntries(Object.entries(item).map(([key, value]) => [key, readText(value)])),
    );

  const rounds = variants.length > 0 ? variants : [{}];

  /*
   * Reanudar: lo que ya salió en una ejecución anterior no se vuelve a pagar.
   *
   * Solo con una vuelta, y a propósito: con varias, cada una es un anuncio
   * distinto y reutilizar lo de otra mezclaría dos.
   */
  const resumeFrom = readText(raw.resumeFrom);
  const previous = new Map<string, NodeResult>();

  if (resumeFrom && rounds.length === 1) {
    for (const output of await listOutputs(resumeFrom)) {
      if (output.error) continue;
      previous.set(output.nodeId, {
        kind: output.kind,
        url: output.url,
        value: output.value,
      });
    }
  }

  return runInBackground({
    productId: flow.productId || undefined,
    kind: "imagenes",
    label: `Flujo · ${flow.name}${rounds.length > 1 ? ` · ${rounds.length} vueltas` : ""}`,
    revalidate: "/flujos",
    resume: { flowId, variants, resumeFrom },
    work: async (report) => {
      const summaries: string[] = [];

      for (const [index, variables] of rounds.entries()) {
        const label = rounds.length > 1 ? `Vuelta ${index + 1} de ${rounds.length}: ` : "";
        const runId = await startRun(flowId, variables);

        try {
          const outcome = await runFlow(flow.graph, {
            runId,
            productId: flow.productId,
            variables,
            report: async (message) => report(`${label}${message}`),
            done: index === 0 ? previous : new Map(),
          });

          const ok = outcome.failed.length === 0;

          await finishRun(
            runId,
            ok ? "hecho" : "error",
            outcome.failed.map((item) => `${item.nodeId}: ${item.problem}`).join(" | "),
          );

          summaries.push(
            ok
              ? `${label}${outcome.done} de ${outcome.total} pasos.`
              : `${label}${outcome.done} de ${outcome.total}; falló ${outcome.failed
                  .map((item) => item.nodeId)
                  .join(", ")}.`,
          );
        } catch (error) {
          const problem = error instanceof Error ? error.message : "falló";

          await finishRun(runId, "error", problem);
          summaries.push(`${label}${problem}`);
        }
      }

      return {
        summary: [
          summaries.join(" "),
          " Lo hecho queda guardado: al volver a lanzarlo no se vuelve a pagar.",
        ].join(""),
      };
    },
  });
}

/* -------------------------------- El avance -------------------------------- */

export interface FlowProgress {
  /** `corriendo`, `hecho`, `error`, `cancelado`, o vacío si nunca se ejecutó. */
  status: string;
  note: string;
  /** Lo que ha producido cada nodo **hasta ahora**. */
  outputs: Record<string, { url: string; kind: string; error: string }>;
  /** Las caras, que pueden haber cambiado si se generaron desde el lienzo. */
  avatars: { id: string; name: string }[];
}

/**
 * Lo que ha avanzado, para pintarlo sin recargar.
 *
 * ## Por qué esto y no `router.refresh()`
 *
 * Refrescar la página vuelve a montar el servidor entero y devuelve el grafo
 * guardado. El lienzo tiene en pantalla lo que se está editando —cajas movidas,
 * ajustes a medio poner— y nada de eso está guardado todavía: un refresco lo
 * pisaría, o peor, no lo pisaría pero tampoco traería los resultados nuevos,
 * que es lo que pasa cuando el estado del lienzo se inicializa una sola vez.
 *
 * Así que se pide **solo lo que cambia** —qué produjo cada nodo— y se mete en
 * las cajas que ya están. Lo que se está editando no se toca.
 *
 * Devuelve también las caras porque se pueden crear desde el propio lienzo, y
 * sin esto habría que recargar para verlas en el desplegable.
 */
export async function flowProgressAction(flowId: unknown): Promise<FlowProgress> {
  const empty: FlowProgress = { status: "", note: "", outputs: {}, avatars: [] };

  try {
    await guard();

    const id = readText(flowId);
    if (!id) return empty;

    const { listRuns, listOutputs } = await import("@/lib/data/flows");
    const { listAvatars } = await import("@/lib/data/avatars");

    const [runs, avatars] = await Promise.all([
      listRuns(id),
      listAvatars().catch(() => []),
    ]);

    const latest = runs[0];

    return {
      status: latest?.status ?? "",
      note: latest?.note ?? "",
      outputs: latest
        ? Object.fromEntries(
            (await listOutputs(latest.id)).map((output) => [
              output.nodeId,
              { url: output.url, kind: output.kind, error: output.error },
            ]),
          )
        : {},
      avatars: avatars.map((avatar) => ({ id: avatar.id, name: avatar.name })),
    };
  } catch {
    // Un fallo del sondeo no puede tumbar el lienzo: se reintenta a la
    // siguiente vuelta y mientras tanto se ve lo último que llegó.
    return empty;
  }
}
