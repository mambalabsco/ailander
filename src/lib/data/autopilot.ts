import "server-only";

import { requireContext } from "@/lib/supabase/session";

/** El autopiloto de un producto, visto por quien manda en él. */
export interface Autopilot {
  productId: string;
  activo: boolean;
  igUserId: string;
  porDia: number;
  colchonDias: number;
  horaDesde: number;
  horaHasta: number;
  ultimaPublicacionAt: string | null;
  /** Vacío es «no está pausado». Con texto, dice por qué se apagó solo. */
  pausadoPor: string;
}

export async function readAutopilot(productId: string): Promise<Autopilot | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("instagram_autopilot")
    .select("*")
    .eq("product_id", productId)
    .limit(1);

  const row = (data ?? [])[0];

  if (!row) return null;

  return {
    productId: row.product_id,
    activo: row.activo,
    igUserId: row.ig_user_id ?? "",
    porDia: row.por_dia,
    colchonDias: row.colchon_dias,
    horaDesde: row.hora_desde,
    horaHasta: row.hora_hasta,
    ultimaPublicacionAt: row.ultima_publicacion_at,
    pausadoPor: row.pausado_por,
  };
}

/**
 * Guarda los ajustes, creando la fila si no existía.
 *
 * `upsert` y no `insert` más `update`: el panel no distingue entre configurar
 * por primera vez y cambiar algo, y hacer que lo distinga solo sirve para tener
 * dos caminos donde uno basta.
 */
export async function saveAutopilot(
  productId: string,
  patch: Omit<Autopilot, "productId" | "ultimaPublicacionAt" | "pausadoPor">,
): Promise<void> {
  const { supabase, userId } = await requireContext();

  await supabase.from("instagram_autopilot").upsert(
    {
      product_id: productId,
      user_id: userId,
      activo: patch.activo,
      ig_user_id: patch.igUserId || null,
      por_dia: patch.porDia,
      colchon_dias: patch.colchonDias,
      hora_desde: patch.horaDesde,
      hora_hasta: patch.horaHasta,
    },
    { onConflict: "product_id" },
  );
}

/**
 * Reanudar borra el motivo **y** la cuenta de fallos.
 *
 * Dejando los fallos puestos, el siguiente tropiezo pausaría otra vez al
 * instante y el botón parecería no hacer nada.
 */
export async function resumeAutopilot(productId: string): Promise<void> {
  const { supabase } = await requireContext();

  await supabase
    .from("instagram_autopilot")
    .update({ pausado_por: "", fallos_seguidos: 0 })
    .eq("product_id", productId);
}
