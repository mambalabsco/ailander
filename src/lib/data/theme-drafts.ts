import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Las secciones ya escritas, para no volver a pagarlas.
 *
 * Recrear una página son diez u once llamadas al modelo. Sin esto, un reinicio
 * del servidor en la novena tiraba las ocho anteriores — ver la cabecera de la
 * migración `20260801000100_theme_section_drafts.sql`.
 */

export interface SectionDraft {
  kind: string;
  ordinal: number;
  sectionType: string;
  liquid: string;
  settings: Record<string, unknown>;
  blocks: { type: string; settings: Record<string, unknown> }[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function blocks(value: unknown): SectionDraft["blocks"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const block = record(item);
    if (typeof block.type !== "string") return [];

    return [{ type: block.type, settings: record(block.settings) }];
  });
}

/** Lo ya escrito para esa página de ese plano, por papel y posición. */
export async function readSectionDrafts(
  blueprintId: string,
  page: string,
): Promise<Map<string, SectionDraft>> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("theme_section_drafts")
    .select("*")
    .eq("blueprint_id", blueprintId)
    .eq("page", page);

  // Quedarse sin caché no puede impedir generar: se paga de más, pero sale.
  if (error) return new Map();

  return new Map(
    (data ?? []).map((row) => [
      `${row.kind}:${row.ordinal}`,
      {
        kind: row.kind,
        ordinal: row.ordinal,
        sectionType: row.section_type,
        liquid: row.liquid,
        settings: record(row.settings),
        blocks: blocks(row.blocks),
      },
    ]),
  );
}

/**
 * Guarda una sección en cuanto pasa la revisión.
 *
 * En cuanto pasa y no al final: guardar al terminar todas es exactamente lo que
 * hacía que un corte a mitad tirara el trabajo entero.
 *
 * No falla hacia fuera. Si la escritura de la caché falla, la generación sigue —
 * habrá que pagarla otra vez si algo se corta, pero perder la sección recién
 * escrita por no poder guardar una copia sería peor.
 */
export async function saveSectionDraft(
  blueprintId: string,
  page: string,
  draft: SectionDraft,
): Promise<void> {
  try {
    const { supabase, userId } = await requireContext();

    await supabase.from("theme_section_drafts").upsert(
      {
        user_id: userId,
        blueprint_id: blueprintId,
        page,
        kind: draft.kind,
        ordinal: draft.ordinal,
        section_type: draft.sectionType,
        liquid: draft.liquid,
        settings: draft.settings,
        blocks: draft.blocks,
      },
      { onConflict: "blueprint_id,page,kind,ordinal" },
    );
  } catch {
    return;
  }
}

/**
 * Olvida una sección concreta.
 *
 * Se usa cuando Shopify la rechaza: si se quedara guardada, el siguiente intento
 * la reutilizaría tal cual y repetiría el mismo rechazo para siempre — la caché,
 * que está para ahorrar, dejaría la página imposible de escribir.
 */
export async function forgetSectionDraft(
  blueprintId: string,
  page: string,
  kind: string,
  ordinal: number,
): Promise<void> {
  try {
    const { supabase } = await requireContext();

    await supabase
      .from("theme_section_drafts")
      .delete()
      .eq("blueprint_id", blueprintId)
      .eq("page", page)
      .eq("kind", kind)
      .eq("ordinal", ordinal);
  } catch {
    return;
  }
}

/** Tira lo guardado de una página, para volver a escribirla desde cero. */
export async function clearSectionDrafts(blueprintId: string, page: string): Promise<number> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("theme_section_drafts")
    .delete()
    .eq("blueprint_id", blueprintId)
    .eq("page", page)
    .select("id");

  if (error) throw new Error(`No se pudo vaciar: ${error.message}`);

  return (data ?? []).length;
}
