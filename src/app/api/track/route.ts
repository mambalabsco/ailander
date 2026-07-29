import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FUNNEL_STEPS } from "@/types/experiment";

/**
 * Recibe los pasos del embudo que solo existen en el navegador.
 *
 * Carrito y pasarela **no están en la API de pedidos**: Shopify solo sabe de
 * pedidos cerrados. Estos avisos llegan desde la página, o desde el pixel de la
 * tienda con `product_added_to_cart` y `checkout_started`.
 *
 * Nada de lo que llega aquí se cree sin comprobar: el `variant_id` tiene que
 * existir y pertenecer al experimento que dice. Sin eso, cualquiera podría
 * inflar los números de una variante mandando peticiones sueltas.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const kind = String(body.kind ?? "");
  if (!FUNNEL_STEPS.includes(kind as (typeof FUNNEL_STEPS)[number]) || kind === "visita") {
    // La visita la cuenta el servidor al servir la página: aceptarla aquí
    // permitiría duplicarla desde el navegador.
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const experimentId = String(body.experiment ?? "");
  const variantId = String(body.variant ?? "");
  if (!experimentId || !variantId) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();

  // Se comprueba que la variante es de ese experimento antes de anotar nada.
  const { data: variant } = await admin
    .from("landing_variants")
    .select("id, experiment_id")
    .eq("id", variantId)
    .eq("experiment_id", experimentId)
    .maybeSingle();

  if (!variant) return NextResponse.json({ ok: false }, { status: 404 });

  const { data: experiment } = await admin
    .from("landing_experiments")
    .select("user_id")
    .eq("id", experimentId)
    .maybeSingle();

  if (!experiment) return NextResponse.json({ ok: false }, { status: 404 });

  const visitor = typeof body.visitor === "string" ? body.visitor.slice(0, 40) : null;
  const value = Number(body.value);

  await admin.from("landing_events").insert({
    user_id: experiment.user_id,
    experiment_id: experimentId,
    variant_id: variantId,
    kind,
    visitor,
    value: Number.isFinite(value) && value > 0 ? String(value) : null,
    currency: typeof body.currency === "string" ? body.currency.slice(0, 8) : null,
  });

  // `sendBeacon` no lee la respuesta: se contesta lo mínimo.
  return NextResponse.json({ ok: true });
}
