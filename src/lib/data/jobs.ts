import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { BackgroundJob, JobKind } from "@/types/jobs";

/**
 * Trabajos en segundo plano: la capa de datos.
 *
 * El estado de una generación vive en la base de datos y no en la memoria del
 * navegador, y esa es toda la idea: así sobrevive a que cierres la pestaña,
 * apagues el portátil o mires desde el móvil.
 */

function toJob(row: {
  id: string;
  product_id: string | null;
  kind: string;
  label: string;
  status: string;
  progress?: string | null;
  resume?: unknown;
  summary: string | null;
  error: string | null;
  result: unknown;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  created_at: string;
  finished_at: string | null;
}): BackgroundJob {
  return {
    id: row.id,
    productId: row.product_id,
    kind: row.kind as JobKind,
    label: row.label,
    status: row.status === "done" ? "done" : row.status === "error" ? "error" : "running",
    progress: row.progress ?? "",
    canResume: row.resume !== null && row.resume !== undefined,
    summary: row.summary,
    error: row.error,
    result: row.result ?? null,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    // `numeric` llega como texto para no perder precisión.
    costUsd: Number(row.cost_usd),
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** Lo guardado para relanzar, cuando lo hay. */
export async function readJobResume(
  jobId: string,
): Promise<{ kind: string; resume: Record<string, unknown> } | null> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .select("kind, resume")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data?.resume) return null;
  if (typeof data.resume !== "object" || Array.isArray(data.resume)) return null;

  return { kind: data.kind, resume: data.resume as Record<string, unknown> };
}

export async function createJob(input: {
  productId?: string | null;
  kind: JobKind;
  label: string;
  /** Con qué relanzarlo si se corta. Solo identificadores. */
  resume?: Record<string, unknown>;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .insert({
      user_id: userId,
      product_id: input.productId ?? null,
      kind: input.kind,
      label: input.label,
      status: "running",
      resume: input.resume ?? null,
    })
    .select("id")
    .single();

  // Aquí sí se lanza: si no se puede anotar el trabajo, la interfaz no tendría
  // forma de enseñar su progreso y parecería que el botón no hizo nada.
  if (error) throw new Error(`No se pudo registrar el trabajo: ${error.message}`);

  return data.id;
}

/**
 * Deja dicho por dónde va el trabajo.
 *
 * No falla nunca hacia fuera: es información de cortesía, y perder el hilo del
 * progreso no puede tumbar la generación que sí importa. Si la escritura falla,
 * el trabajo sigue y el cartel se queda como estaba.
 */
export async function reportProgress(jobId: string, progress: string): Promise<void> {
  try {
    const { supabase } = await requireContext();
    await supabase.from("background_jobs").update({ progress }).eq("id", jobId);
  } catch {
    return;
  }
}

/** Pide que un trabajo se pare. Él lo mira entre pasos. */
export async function requestCancel(jobId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("background_jobs")
    .update({ cancel_requested: true })
    .eq("id", jobId)
    .eq("status", "running");

  if (error) throw new Error(`No se pudo cancelar: ${error.message}`);
}

/**
 * Si le han pedido pararse.
 *
 * Falla hacia «sigue»: perder la consulta no puede detener una generación que va
 * bien, y quien quiera pararla puede volver a pulsar.
 */
export async function cancelRequested(jobId: string): Promise<boolean> {
  try {
    const { supabase } = await requireContext();

    const { data } = await supabase
      .from("background_jobs")
      .select("cancel_requested")
      .eq("id", jobId)
      .maybeSingle();

    return data?.cancel_requested === true;
  } catch {
    return false;
  }
}

export async function finishJob(
  jobId: string,
  input: {
    status: "done" | "error";
    summary?: string;
    error?: string;
    result?: unknown;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  },
): Promise<void> {
  try {
    const { supabase } = await requireContext();

    await supabase
      .from("background_jobs")
      .update({
        status: input.status,
        summary: input.summary ?? null,
        error: input.error ?? null,
        result: (input.result ?? null) as never,
        input_tokens: input.inputTokens ?? 0,
        output_tokens: input.outputTokens ?? 0,
        cost_usd: String(input.costUsd ?? 0),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch {
    /*
     * No se propaga, y es deliberado.
     *
     * Esto corre después de la respuesta: aquí ya no hay nadie a quien avisar,
     * y lanzar solo dejaría un error sin dueño en los registros del servidor.
     * El trabajo se queda como «en marcha», que la interfaz sabe caducar.
     */
  }
}

/**
 * Cuándo arrancó este proceso.
 *
 * Es la pieza que permite saber, sin margen de duda, qué trabajos murieron: la
 * plataforma corre en un solo proceso, así que **un trabajo creado antes de que
 * este arrancara y que siga marcado «en marcha» no puede estar corriendo**. Se
 * lo llevó el reinicio.
 */
const BOOTED_AT = new Date().toISOString();

/**
 * Marca como cortados los trabajos que se llevó un reinicio.
 *
 * Sin esto, un despliegue a mitad de una generación deja el trabajo diciendo «en
 * marcha» durante hora y media —lo que tarda en caducar por tiempo— antes de
 * admitir que murió. Y mientras tanto no ofrece el botón de continuar, porque
 * para la interfaz sigue vivo: hay que esperar a que caduque para poder
 * retomarlo, que es lo contrario de lo que hace falta.
 *
 * Comparando contra el arranque se sabe **en el acto**, y el aviso aparece con
 * su botón en la primera carga.
 *
 * Corre una vez por proceso: es una escritura, y repetirla en cada pantalla no
 * encontraría nada nuevo.
 */
let sweeping: Promise<void> | null = null;

function sweepInterrupted(): Promise<void> {
  sweeping ??= (async () => {
    try {
      const { supabase } = await requireContext();

      await supabase
        .from("background_jobs")
        .update({
          status: "error",
          error:
            "Se cortó al reiniciarse el servidor. Continúalo: lo que ya estuviera hecho se reutiliza y no se vuelve a pagar.",
          finished_at: new Date().toISOString(),
        })
        .eq("status", "running")
        .lt("created_at", BOOTED_AT);
    } catch {
      // Es cortesía: si falla, los trabajos caducan por tiempo como antes.
    }
  })();

  return sweeping;
}

/**
 * Los trabajos de un producto.
 *
 * Se piden los recientes, no solo los activos: al terminar uno hay que poder
 * enseñar qué salió, y un trabajo que desaparece en cuanto acaba deja a la
 * persona sin saber si funcionó.
 */
export async function listJobs(productId: string, limit = 12): Promise<BackgroundJob[]> {
  await sweepInterrupted();

  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudieron leer los trabajos: ${error.message}`);

  return (data ?? []).map(toJob);
}

/**
 * Trabajos que no cuelgan de ningún producto.
 *
 * La sincronización de una tienda no pertenece a un producto: es de la tienda
 * entera. `listJobs` filtra por `product_id`, así que estos nunca aparecerían en
 * ninguna parte y una sincronización fallida se perdería en silencio, que es el
 * modo exacto en que un dato mal sale sin que nadie se entere.
 */
export async function listJobsByKind(kind: JobKind, limit = 12): Promise<BackgroundJob[]> {
  await sweepInterrupted();

  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("kind", kind)
    .is("product_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudieron leer los trabajos: ${error.message}`);

  return (data ?? []).map(toJob);
}

export async function readJob(jobId: string): Promise<BackgroundJob | null> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el trabajo: ${error.message}`);

  return data ? toJob(data) : null;
}

/**
 * Quita de la vista los terminados.
 *
 * **No borra los que guardan un resultado**, y esa condición se añadió después
 * de perder trabajo pagado: los candidatos de una búsqueda de competidores
 * viven en la fila del trabajo hasta que los apruebas, y limpiar la lista se
 * llevó por delante cuatro candidatos que habían costado casi un dólar.
 *
 * Los que siguen en marcha tampoco se tocan.
 *
 * `null` limpia los que no cuelgan de ningún producto —las sincronizaciones de
 * tienda—. Hace falta la distinción porque `.eq("product_id", null)` en
 * PostgREST **no encuentra nada**: en SQL nada es igual a nulo, y hay que usar
 * `is`. Sin esto el botón de limpiar no haría nada y parecería roto.
 */
export async function clearFinishedJobs(productId: string | null): Promise<void> {
  const { supabase } = await requireContext();

  const query = supabase.from("background_jobs").delete();

  await (productId === null
    ? query.is("product_id", null)
    : query.eq("product_id", productId)
  )
    .neq("status", "running")
    .is("result", null);
}

/**
 * El último trabajo terminado de un tipo, para este producto.
 *
 * **Existe por un fallo real.** La búsqueda de competidores devuelve candidatos
 * que tú confirmas, y esos candidatos vivían solo en el estado del navegador,
 * atado al id del trabajo. La búsqueda tarda minutos: si recargabas o volvías
 * más tarde, el trabajo estaba guardado y pagado, pero la lista era inalcanzable
 * y no había forma de añadir ninguno.
 *
 * Leyéndolo del servidor, el resultado sigue ahí mañana y desde otro navegador.
 */
export async function readLatestJob(
  productId: string,
  kind: JobKind,
): Promise<BackgroundJob | null> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("product_id", productId)
    .eq("kind", kind)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data ? toJob(data) : null;
}
