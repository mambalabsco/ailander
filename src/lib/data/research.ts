import "server-only";
import { marketFilter } from "@/lib/market-filter";
import type { Selection } from "@/lib/market-price";

import { requireContext } from "@/lib/supabase/session";
import { emptyProductResearch, type ProductResearch, type ProductHook } from "@/types/research";
import type { ResearchDocumentId } from "@/types/research";
import type { Tables } from "@/types/database";
import type { Json } from "@/types/database";

/**
 * Investigación y ganchos en Supabase.
 *
 * Los seis documentos viven en filas de `research_documents`, una por producto
 * y documento, con su Markdown y su JSON. La aplicación los consume como un
 * único objeto `ProductResearch`, así que aquí se recomponen: la interfaz sigue
 * recibiendo exactamente lo mismo que recibía del archivo JSON.
 *
 * El JSON de cada documento se guarda tal cual lo devuelve el modelo, validado
 * antes contra los tipos. Aquí solo se transporta.
 */

const DOCUMENT_KEYS: ResearchDocumentId[] = [
  "awareness",
  "competitors",
  "avatars",
  "master",
  "desire-extraction",
  "desire-validation",
];

/**
 * Dónde vive el JSON de cada documento dentro de `ProductResearch`.
 *
 * Los cuatro primeros tienen su propia clave; los dos del deseo usan nombres
 * distintos del identificador, herencia de cómo se nombraron los prompts.
 */
const DATA_KEY: Record<ResearchDocumentId, keyof ProductResearch> = {
  awareness: "awareness",
  competitors: "competitors",
  avatars: "avatars",
  master: "master",
  "desire-extraction": "desireExtraction",
  "desire-validation": "desireValidation",
};

export async function readProductResearch(productId: string): Promise<ProductResearch> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("research_documents")
    .select("*")
    .eq("product_id", productId);

  if (error) throw new Error(`No se pudo leer la investigación: ${error.message}`);

  const research = emptyProductResearch();

  for (const row of data ?? []) {
    research.documents[row.document_id] = {
      status: row.status,
      generatedAt: row.generated_at,
      markdown: row.markdown,
      ...(row.error ? { error: row.error } : {}),
    };

    if (row.data !== null) {
      // El JSON viene validado contra los tipos antes de guardarse; aquí solo
      // se coloca en su sitio.
      (research as unknown as Record<string, unknown>)[DATA_KEY[row.document_id]] = row.data;
    }
  }

  return research;
}

/**
 * Guarda los seis documentos de una vez.
 *
 * Es un `upsert` sobre `(product_id, document_id)`: la aplicación trabaja con
 * el paquete entero y comparar cuáles cambiaron costaría más de lo que ahorra.
 */
export async function saveProductResearch(
  productId: string,
  research: ProductResearch,
): Promise<void> {
  const { supabase, userId } = await requireContext();

  const rows = DOCUMENT_KEYS.map((id) => {
    const state = research.documents[id];
    const payload = (research as unknown as Record<string, unknown>)[DATA_KEY[id]];

    return {
      user_id: userId,
      product_id: productId,
      document_id: id,
      status: state.status,
      markdown: state.markdown,
      data: (payload ?? null) as Json | null,
      error: state.error ?? "",
      generated_at: state.generatedAt,
    };
  });

  const { error } = await supabase
    .from("research_documents")
    .upsert(rows, { onConflict: "product_id,document_id", defaultToNull: false });

  if (error) throw new Error(`No se pudo guardar la investigación: ${error.message}`);
}

/** Guarda un solo documento, que es como los devuelve la generación. */
export async function saveResearchDocument(input: {
  productId: string;
  documentId: ResearchDocumentId;
  status: ProductResearch["documents"][ResearchDocumentId]["status"];
  markdown: string;
  data: unknown;
  error?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("research_documents").upsert(
    {
      user_id: userId,
      product_id: input.productId,
      document_id: input.documentId,
      status: input.status,
      markdown: input.markdown,
      data: (input.data ?? null) as Json | null,
      error: input.error ?? "",
      generated_at: input.status === "ready" ? new Date().toISOString() : null,
      model: input.model ?? "",
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
    },
    { onConflict: "product_id,document_id", defaultToNull: false },
  );

  if (error) throw new Error(`No se pudo guardar el documento: ${error.message}`);
}

/* ----------------------------------- Ganchos ----------------------------------- */

function toHook(row: Tables<"hooks">): ProductHook {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title,
    body: row.body,
    awarenessLevel: row.awareness_level,
    desire: row.desire,
    angle: row.angle,
    format: row.format,
    isUsed: row.used,
    createdAt: row.created_at,
    usedAt: row.used_at ?? undefined,
    batchId: row.batch_id,
  };
}

export async function readProductHooks(productId: string, selection?: Selection): Promise<ProductHook[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("hooks")
    .select("*")
    .eq("product_id", productId)
    .or(marketFilter(selection))
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los ganchos: ${error.message}`);
  return (data ?? []).map(toHook);
}

/**
 * Añade una tanda de ganchos.
 *
 * **Añade, no reemplaza.** Los ganchos se generan de diez en diez y se van
 * acumulando; sustituir la lista entera borraría los ya marcados como usados,
 * que es justo la información que evita repetir el mismo gancho dos veces.
 */
export async function addProductHooks(
  productId: string,
  hooks: Omit<ProductHook, "id" | "productId">[],
  marketId?: string | null,
): Promise<ProductHook[]> {
  if (hooks.length === 0) return [];

  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("hooks")
    .insert(
      hooks.map((hook) => ({
        user_id: userId,
        product_id: productId,
        market_id: marketId ?? null,
        title: hook.title,
        body: hook.body,
        awareness_level: hook.awarenessLevel,
        desire: hook.desire,
        angle: hook.angle,
        format: hook.format,
        used: hook.isUsed,
        used_at: hook.usedAt ?? null,
        batch_id: hook.batchId,
      })),
      { defaultToNull: false },
    )
    .select("*");

  if (error) throw new Error(`No se pudieron guardar los ganchos: ${error.message}`);
  return (data ?? []).map(toHook);
}

export async function toggleHookUsed(hookId: string): Promise<ProductHook | null> {
  const { supabase } = await requireContext();

  const { data: current, error: readError } = await supabase
    .from("hooks")
    .select("used")
    .eq("id", hookId)
    .maybeSingle();

  if (readError) throw new Error(`No se pudo leer el gancho: ${readError.message}`);
  if (!current) return null;

  const used = !current.used;

  const { data, error } = await supabase
    .from("hooks")
    .update({ used, used_at: used ? new Date().toISOString() : null })
    .eq("id", hookId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`No se pudo marcar el gancho: ${error.message}`);
  return data ? toHook(data) : null;
}
