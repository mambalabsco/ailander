import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderLandingHtml } from "@/lib/landing-html";
import { pickVariant } from "@/types/experiment";
import { siteOrigin } from "@/lib/site-url";
import type { LandingPage } from "@/types/landing";

/**
 * El repartidor de tráfico. Shopify llama aquí y devuelve la página elegida.
 *
 * Se registra como **App Proxy** en la app personalizada de la tienda: el
 * visitante abre `tutienda.com/apps/lp/<slug>` y Shopify reenvía la petición
 * aquí, sin redirección y sin parpadeo. Una sola URL en el anuncio, cinco
 * páginas detrás.
 *
 * Tres cosas que condicionan cómo está escrito:
 *
 * 1. **Shopify elimina `Set-Cookie` de la respuesta del proxy.** No se puede
 *    fijar la cookie del visitante desde el servidor, así que la escribe un
 *    script en línea de la propia página. En la primera visita el identificador
 *    llega por la URL o se genera aquí; a partir de la segunda viaja en la
 *    cookie que puso ese script.
 *
 * 2. **El reparto es determinista sobre ese identificador.** Si cada visita
 *    sorteara de nuevo, quien recarga vería otra página y sus pasos se
 *    repartirían entre dos variantes.
 *
 * 3. **Se usa el cliente de servicio.** Aquí no hay sesión de nadie: la petición
 *    viene de Shopify, no del navegador del dueño de la cuenta.
 */

export const dynamic = "force-dynamic";

/** Identificador anónimo del visitante. No es un dato personal. */
function newVisitor(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

function readVisitorCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/(?:^|;\s*)lp_v=([a-z0-9]+)/i);
  return match ? match[1] : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const url = new URL(request.url);

  const admin = createAdminClient();

  const { data: experiment } = await admin
    .from("landing_experiments")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (!experiment) {
    return new NextResponse("No hay ninguna prueba activa con ese nombre.", { status: 404 });
  }

  const { data: variants } = await admin
    .from("landing_variants")
    .select("id, landing_id, weight")
    .eq("experiment_id", experiment.id);

  const options = (variants ?? []).map((variant) => ({
    id: variant.id,
    landingId: variant.landing_id,
    weight: variant.weight,
  }));

  const visitor = readVisitorCookie(request.headers.get("cookie")) ?? newVisitor();
  const chosen = pickVariant(options, visitor);

  if (!chosen) {
    return new NextResponse("La prueba no tiene ninguna variante con peso.", { status: 409 });
  }

  const { data: landingRow } = await admin
    .from("landing_pages")
    .select("*")
    .eq("id", chosen.landingId)
    .maybeSingle();

  if (!landingRow) return new NextResponse("La página ya no existe.", { status: 404 });

  const page: LandingPage = {
    id: landingRow.id,
    productId: landingRow.product_id,
    title: landingRow.title,
    slug: landingRow.slug,
    hideThemeChrome: landingRow.hide_theme_chrome,
    header: landingRow.header as LandingPage["header"],
    author: landingRow.author as LandingPage["author"],
    sections: (landingRow.sections as LandingPage["sections"]) ?? [],
    imageSlots: (landingRow.image_slots as LandingPage["imageSlots"]) ?? [],
    comments: (landingRow.comments as LandingPage["comments"]) ?? [],
    createdAt: landingRow.created_at,
  };

  /*
   * La visita se anota **antes** de responder, no desde el navegador.
   *
   * Es el único paso del embudo que no depende de que se ejecute JavaScript, y
   * por eso es el más fiable de los cuatro: ni bloqueadores ni pestañas cerradas
   * a medio cargar lo pierden.
   */
  await admin.from("landing_events").insert({
    user_id: experiment.user_id,
    experiment_id: experiment.id,
    variant_id: chosen.id,
    kind: "visita",
    visitor,
    utm_content: url.searchParams.get("utm_content"),
  });

  // Las imágenes ya están en el CDN de Shopify si la página se publicó.
  const { data: images } = await admin
    .from("product_images")
    .select("concept, shopify_url")
    .eq("product_id", landingRow.product_id)
    .not("shopify_url", "is", null);

  const urls: Record<string, string> = {};
  const avatars: string[] = [];

  for (const image of images ?? []) {
    if (!image.concept || !image.shopify_url) continue;
    if (image.concept.startsWith("avatar-")) avatars.push(image.shopify_url);
    else urls[image.concept] = image.shopify_url;
  }

  const html = renderLandingHtml(page, { urls, avatars, embedUrls: true });

  // El origen público, no el del socket: con `url.origin` los avisos del embudo
  // se mandarían a localhost desde el navegador del visitante y se perderían
  // todos en silencio.
  const origen = await siteOrigin();

  /*
   * El script hace tres cosas que el servidor no puede.
   *
   * Fija la cookie —Shopify borra `Set-Cookie` de esta respuesta—, y avisa de
   * los pasos intermedios del embudo, que solo existen en el navegador: la API
   * de pedidos no sabe nada de carritos ni de pasarelas.
   */
  const tracker = `<script>
(function(){
  var v = ${JSON.stringify(visitor)};
  document.cookie = "lp_v=" + v + ";path=/;max-age=" + (60*60*24*90) + ";SameSite=Lax";
  try {
    localStorage.setItem("lp_variant", ${JSON.stringify(chosen.id)});
    // El pixel de Shopify corre en otra página y necesita los dos.
    localStorage.setItem("lp_experiment", ${JSON.stringify(experiment.id)});
  } catch (e) {}

  window.__lpTrack = function(kind, value, currency){
    try {
      navigator.sendBeacon(${JSON.stringify(`${origen}/api/track`)}, new Blob([JSON.stringify({
        experiment: ${JSON.stringify(experiment.id)},
        variant: ${JSON.stringify(chosen.id)},
        visitor: v, kind: kind, value: value, currency: currency
      })], {type:"application/json"}));
    } catch (e) {}
  };
})();
</script>`;

  return new NextResponse(`${html}\n${tracker}`, {
    status: 200,
    headers: {
      // Liquid para que Shopify lo pinte dentro del tema de la tienda.
      "Content-Type": "application/liquid; charset=utf-8",
      // Sin caché: cada visitante puede llevarse una variante distinta.
      "Cache-Control": "no-store",
    },
  });
}
