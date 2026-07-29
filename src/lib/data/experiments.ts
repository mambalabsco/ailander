import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { FunnelCounts, LandingExperiment } from "@/types/experiment";

/** Experimentos de reparto de tráfico y sus eventos. */

export async function listExperiments(productId: string): Promise<LandingExperiment[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("landing_experiments")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los experimentos: ${error.message}`);

  const experiments = data ?? [];
  if (experiments.length === 0) return [];

  const { data: variants } = await supabase
    .from("landing_variants")
    .select("*")
    .in(
      "experiment_id",
      experiments.map((item) => item.id),
    );

  return experiments.map((row) => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    variants: (variants ?? [])
      .filter((variant) => variant.experiment_id === row.id)
      .map((variant) => ({
        id: variant.id,
        landingId: variant.landing_id,
        weight: variant.weight,
      })),
    createdAt: row.created_at,
  }));
}

export async function saveExperiment(input: {
  productId: string;
  name: string;
  slug: string;
  variants: { landingId: string; weight: number }[];
  id?: string;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  let experimentId = input.id;

  if (experimentId) {
    await supabase
      .from("landing_experiments")
      .update({ name: input.name, slug: input.slug })
      .eq("id", experimentId);
  } else {
    const { data, error } = await supabase
      .from("landing_experiments")
      .insert({
        user_id: userId,
        product_id: input.productId,
        name: input.name,
        slug: input.slug,
      })
      .select("id")
      .single();

    if (error) throw new Error(`No se pudo crear el experimento: ${error.message}`);
    experimentId = data.id;
  }

  /*
   * Las variantes se reescriben enteras.
   *
   * Cambiar pesos es la operación normal y comparar cuál cambió costaría más de
   * lo que ahorra. Los eventos ya registrados apuntan a la variante por su id,
   * así que **no se borran las filas existentes**: se actualizan.
   */
  const { data: existing } = await supabase
    .from("landing_variants")
    .select("id, landing_id")
    .eq("experiment_id", experimentId);

  const known = new Map((existing ?? []).map((item) => [item.landing_id, item.id]));

  for (const variant of input.variants) {
    const id = known.get(variant.landingId);

    if (id) {
      await supabase.from("landing_variants").update({ weight: variant.weight }).eq("id", id);
      known.delete(variant.landingId);
    } else {
      await supabase.from("landing_variants").insert({
        experiment_id: experimentId,
        landing_id: variant.landingId,
        weight: variant.weight,
      });
    }
  }

  // Las que ya no están en la lista se quitan; sus eventos se van con ellas.
  for (const id of known.values()) {
    await supabase.from("landing_variants").delete().eq("id", id);
  }

  return experimentId;
}

export async function deleteExperiment(id: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from("landing_experiments").delete().eq("id", id);
}

/** Los cuatro pasos del embudo por variante. */
export async function readFunnels(
  experimentId: string,
  days: number,
): Promise<Map<string, FunnelCounts>> {
  const { supabase } = await requireContext();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("landing_events")
    .select("variant_id, kind, value, currency")
    .eq("experiment_id", experimentId)
    .gte("created_at", since);

  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`);

  const funnels = new Map<string, FunnelCounts>();

  for (const event of data ?? []) {
    if (!event.variant_id) continue;

    const counts =
      funnels.get(event.variant_id) ??
      ({ visita: 0, carrito: 0, pasarela: 0, compra: 0, revenue: 0, currency: "MXN" } as FunnelCounts);

    if (event.kind === "visita") counts.visita += 1;
    else if (event.kind === "carrito") counts.carrito += 1;
    else if (event.kind === "pasarela") counts.pasarela += 1;
    else if (event.kind === "compra") {
      counts.compra += 1;
      counts.revenue += Number(event.value ?? 0);
      if (event.currency) counts.currency = event.currency;
    }

    funnels.set(event.variant_id, counts);
  }

  return funnels;
}
