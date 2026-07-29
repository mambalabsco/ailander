import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { GeneratedCopy, MarketingAngle } from "@/types/copy";
import type { Tables } from "@/types/database";

/**
 * Ángulos y textos en Supabase.
 *
 * El ángulo es la entidad central: lleva el mecanismo único del problema y el
 * de la solución, y de él comen tanto el long copy como los publirreportajes.
 * Por eso el copy referencia al ángulo con clave foránea y no con una copia del
 * texto: si se corrige un mecanismo, se corrige en un sitio.
 */

/* ---------------------------------- Ángulos ------------------------------------ */

function toAngle(row: Tables<"angles">): MarketingAngle {
  return {
    id: row.id,
    productId: row.product_id,
    desire: row.desire,
    name: row.name,
    targetAudience: row.target_audience,
    storyArc: {
      start: row.story_start,
      crisis: row.story_crisis,
      discovery: row.story_discovery,
      resolution: row.story_resolution,
    },
    problemMechanism: row.problem_mechanism,
    solutionMechanism: row.solution_mechanism,
    emotionalMoment: row.emotional_moment,
    createdAt: row.created_at,
  };
}

export async function readAngles(productId: string): Promise<MarketingAngle[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("angles")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los ángulos: ${error.message}`);
  return (data ?? []).map(toAngle);
}

/**
 * Añade ángulos nuevos sin tocar los que ya están.
 *
 * Los ángulos se generan de cinco en cinco por deseo, y los copys ya escritos
 * apuntan a ellos con clave foránea: reemplazar la lista dejaría esos copys
 * huérfanos de mecanismo.
 */
export async function addAngles(
  productId: string,
  angles: Omit<MarketingAngle, "id" | "productId" | "createdAt">[],
): Promise<MarketingAngle[]> {
  if (angles.length === 0) return [];

  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("angles")
    .insert(
      angles.map((angle) => ({
        user_id: userId,
        product_id: productId,
        desire: angle.desire,
        name: angle.name,
        target_audience: angle.targetAudience,
        story_start: angle.storyArc.start,
        story_crisis: angle.storyArc.crisis,
        story_discovery: angle.storyArc.discovery,
        story_resolution: angle.storyArc.resolution,
        problem_mechanism: angle.problemMechanism,
        solution_mechanism: angle.solutionMechanism,
        emotional_moment: angle.emotionalMoment,
      })),
      { defaultToNull: false },
    )
    .select("*");

  if (error) throw new Error(`No se pudieron guardar los ángulos: ${error.message}`);
  return (data ?? []).map(toAngle);
}

export async function deleteAngle(angleId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("angles")
    .delete({ count: "exact" })
    .eq("id", angleId);

  if (error) throw new Error(`No se pudo borrar el ángulo: ${error.message}`);
  return (count ?? 0) > 0;
}

/* ----------------------------------- Copys ------------------------------------- */

function toCopy(row: Tables<"copies">): GeneratedCopy {
  return {
    id: row.id,
    productId: row.product_id,
    format: row.format,
    methodId: row.method_id,
    driver: row.driver,
    driverLabel: row.driver_label,
    angleId: row.angle_id ?? undefined,
    hookId: row.hook_id ?? undefined,
    awarenessLevel: row.awareness_level,
    content: {
      primaryText: row.primary_text,
      headline: row.headline,
      description: row.description,
    },
    wordCount: row.word_count,
    status: row.status,
    adsetId: row.adset_id ?? undefined,
    adNumber: row.ad_number ?? undefined,
    adName: row.ad_name || undefined,
    createdAt: row.created_at,
  };
}

export async function readCopies(productId: string): Promise<GeneratedCopy[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("copies")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los copys: ${error.message}`);
  return (data ?? []).map(toCopy);
}

export async function addCopies(
  productId: string,
  copies: Omit<GeneratedCopy, "id" | "productId" | "createdAt">[],
): Promise<GeneratedCopy[]> {
  if (copies.length === 0) return [];

  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("copies")
    .insert(
      copies.map((copy) => ({
        user_id: userId,
        product_id: productId,
        angle_id: copy.angleId ?? null,
        hook_id: copy.hookId ?? null,
        adset_id: copy.adsetId ?? null,
        ad_number: copy.adNumber ?? null,
        ad_name: copy.adName ?? "",
        format: copy.format,
        method_id: copy.methodId,
        driver: copy.driver,
        driver_label: copy.driverLabel,
        awareness_level: copy.awarenessLevel,
        primary_text: copy.content.primaryText,
        headline: copy.content.headline,
        description: copy.content.description,
        word_count: copy.wordCount,
        status: copy.status,
      })),
      { defaultToNull: false },
    )
    .select("*");

  if (error) throw new Error(`No se pudieron guardar los copys: ${error.message}`);
  return (data ?? []).map(toCopy);
}

export async function updateCopyStatus(
  copyId: string,
  status: GeneratedCopy["status"],
): Promise<GeneratedCopy | null> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("copies")
    .update({ status })
    .eq("id", copyId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
  return data ? toCopy(data) : null;
}

/** Coloca un long copy o publirreportaje dentro de un conjunto de anuncios. */
export async function assignCopyToAdset(input: {
  copyId: string;
  adsetId: string | null;
  adNumber: number | null;
  adName: string;
}): Promise<GeneratedCopy | null> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("copies")
    .update({
      adset_id: input.adsetId,
      ad_number: input.adNumber,
      ad_name: input.adName,
    })
    .eq("id", input.copyId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`No se pudo asignar el copy: ${error.message}`);
  return data ? toCopy(data) : null;
}

export async function deleteCopy(copyId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("copies")
    .delete({ count: "exact" })
    .eq("id", copyId);

  if (error) throw new Error(`No se pudo borrar el copy: ${error.message}`);
  return (count ?? 0) > 0;
}
