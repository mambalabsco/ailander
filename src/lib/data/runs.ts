import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { estimateCost } from "@/lib/claude";

/**
 * Registro de lo que gasta la plataforma.
 *
 * **Existe porque el coste solo vivía en un mensaje que desaparecía al recargar
 * la página.** Una tanda de investigación costó $4,21 y no había forma de
 * saberlo después: ni cuánto, ni en qué documento, ni con qué modelo. Sin eso no
 * se puede decidir si un modelo más barato compensa.
 *
 * El coste se guarda **calculado en el momento**, no se recalcula al leer. Los
 * precios cambian, y un histórico que se recalcula con tarifas nuevas deja de
 * ser un histórico.
 */

export type RunKind = "investigacion" | "extraccion" | "copy" | "imagen";

export interface RunRecord {
  id: string;
  productId: string | null;
  productName: string | null;
  kind: RunKind;
  detail: string | null;
  model: string | null;
  status: "ok" | "error";
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number;
  createdAt: string;
}

/**
 * Anota una generación.
 *
 * **Nunca lanza.** Si el registro fallara, propagar el error tiraría abajo una
 * generación que ya está pagada y guardada — se perdería el trabajo por no poder
 * anotarlo, que es exactamente al revés de lo que interesa.
 */
export async function recordRun(input: {
  productId?: string | null;
  productName?: string | null;
  kind: RunKind;
  detail?: string;
  model?: string;
  status?: "ok" | "error";
  error?: string | null;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
}): Promise<void> {
  try {
    const { supabase, userId } = await requireContext();

    await supabase.from("generation_runs").insert({
      user_id: userId,
      product_id: input.productId ?? null,
      product_name: input.productName ?? null,
      kind: input.kind,
      detail: input.detail ?? null,
      model: input.model ?? null,
      status: input.status ?? "ok",
      error: input.error ?? null,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      web_searches: input.webSearches ?? 0,
      cost_usd: String(
        estimateCost(input.model ?? "", input.inputTokens, input.outputTokens) +
          // Las búsquedas web se facturan aparte: unos 10 dólares por millar.
          (input.webSearches ?? 0) * 0.01,
      ),
    });
  } catch {
    // Ver el comentario de arriba: anotar es secundario respecto a generar.
  }
}

export async function listRuns(limit = 100): Promise<RunRecord[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("generation_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    kind: row.kind as RunKind,
    detail: row.detail,
    model: row.model,
    status: row.status === "error" ? "error" : "ok",
    error: row.error,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    webSearches: row.web_searches,
    // Llega como texto desde `numeric`; convertirlo aquí y no en la consulta
    // evita un NaN silencioso al sumar.
    costUsd: Number(row.cost_usd),
    createdAt: row.created_at,
  }));
}

export interface RunTotals {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number;
}

export function totalsOf(runs: RunRecord[]): RunTotals {
  return runs.reduce<RunTotals>(
    (total, run) => ({
      runs: total.runs + 1,
      inputTokens: total.inputTokens + run.inputTokens,
      outputTokens: total.outputTokens + run.outputTokens,
      webSearches: total.webSearches + run.webSearches,
      costUsd: total.costUsd + run.costUsd,
    }),
    { runs: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: 0 },
  );
}
