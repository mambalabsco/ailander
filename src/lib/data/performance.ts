import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type {
  PerformanceMetrics,
  PerformanceRating,
  PerformanceRecord,
  PerformanceTargetType,
} from "@/types/performance";
import type { Tables } from "@/types/database";

/**
 * Rendimiento marcado a mano.
 *
 * Es lo que convierte la plataforma en algo que aprende: sin saber qué funcionó
 * y qué no, la IA solo puede repetir lo que ya escribió. La nota es la parte
 * más valiosa —el porqué—, y por eso no es opcional en la interfaz aunque la
 * columna admita cadena vacía.
 *
 * La clave es `(product_id, target_type, target_id)`, así que marcar dos veces
 * la misma pieza actualiza en vez de duplicar.
 */

function toRecord(row: Tables<"performance_records">): PerformanceRecord {
  const metrics: PerformanceMetrics = {};
  if (row.spend !== null) metrics.spend = Number(row.spend);
  if (row.roas !== null) metrics.roas = Number(row.roas);
  if (row.ctr !== null) metrics.ctr = Number(row.ctr);
  if (row.cpa !== null) metrics.cpa = Number(row.cpa);

  return {
    id: row.id,
    productId: row.product_id,
    targetType: row.target_type,
    targetId: row.target_id,
    rating: row.rating,
    metrics,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export async function readPerformance(productId: string): Promise<PerformanceRecord[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("performance_records")
    .select("*")
    .eq("product_id", productId);

  if (error) throw new Error(`No se pudo leer el rendimiento: ${error.message}`);
  return (data ?? []).map(toRecord);
}

export async function setPerformance(input: {
  productId: string;
  targetType: PerformanceTargetType;
  targetId: string;
  rating: PerformanceRating;
  note: string;
  metrics: PerformanceMetrics;
}): Promise<PerformanceRecord> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("performance_records")
    .upsert(
      {
        user_id: userId,
        product_id: input.productId,
        target_type: input.targetType,
        target_id: input.targetId,
        rating: input.rating,
        note: input.note,
        spend: input.metrics.spend ?? null,
        roas: input.metrics.roas ?? null,
        ctr: input.metrics.ctr ?? null,
        cpa: input.metrics.cpa ?? null,
      },
      { onConflict: "product_id,target_type,target_id", defaultToNull: false },
    )
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo guardar el rendimiento: ${error.message}`);
  return toRecord(data);
}

export async function clearPerformance(
  productId: string,
  targetType: PerformanceTargetType,
  targetId: string,
): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("performance_records")
    .delete({ count: "exact" })
    .eq("product_id", productId)
    .eq("target_type", targetType)
    .eq("target_id", targetId);

  if (error) throw new Error(`No se pudo borrar la valoración: ${error.message}`);
  return (count ?? 0) > 0;
}
