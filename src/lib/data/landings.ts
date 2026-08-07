import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { LandingTheme } from "@/lib/landing-theme";
import type {
  LandingAuthor,
  LandingComment,
  LandingHeader,
  LandingImageSlot,
  LandingPage,
  LandingSection,
} from "@/types/landing";

/** Publirreportajes guardados como página, no como texto plano. */

function toLanding(row: {
  id: string;
  product_id: string;
  copy_id: string | null;
  title: string;
  slug: string;
  method_id: string | null;
  header: unknown;
  author: unknown;
  sections: unknown;
  image_slots: unknown;
  comments: unknown;
  hide_theme_chrome: boolean;
  utm_campaign: string | null;
  shopify_page_id: string | null;
  shopify_url: string | null;
  published_at: string | null;
  theme: unknown;
  created_at: string;
  /** Vacío en las páginas anteriores a que existieran las formas. */
  shape_id?: string;
}): LandingPage {
  return {
    id: row.id,
    productId: row.product_id,
    copyId: row.copy_id ?? undefined,
    /*
     * El aspecto viene de una columna `jsonb`, así que puede ser cualquier
     * cosa. Se comprueba que al menos trae los colores: medio tema deja reglas
     * de CSS sin valor, y con ellas se cae el resto de la hoja.
     */
    theme:
      typeof row.theme === "object" && row.theme !== null && "ink" in row.theme
        ? (row.theme as LandingPage["theme"])
        : undefined,
    title: row.title,
    slug: row.slug,
    methodId: row.method_id ?? undefined,
    shapeId: row.shape_id || undefined,
    header: (row.header as LandingHeader) ?? undefined,
    author: (row.author as LandingAuthor) ?? undefined,
    sections: (row.sections as LandingSection[]) ?? [],
    imageSlots: (row.image_slots as LandingImageSlot[]) ?? [],
    comments: (row.comments as LandingComment[]) ?? [],
    hideThemeChrome: row.hide_theme_chrome,
    utmCampaign: row.utm_campaign ?? undefined,
    shopifyPageId: row.shopify_page_id ?? undefined,
    shopifyUrl: row.shopify_url ?? undefined,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function saveLanding(input: {
  productId: string;
  copyId?: string;
  title: string;
  slug: string;
  methodId?: string;
  shapeId?: string;
  header?: LandingHeader;
  author?: LandingAuthor;
  sections: LandingSection[];
  imageSlots: LandingImageSlot[];
  comments: LandingComment[];
  theme?: LandingTheme;
}): Promise<LandingPage> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("landing_pages")
    .insert({
      user_id: userId,
      product_id: input.productId,
      copy_id: input.copyId ?? null,
      title: input.title,
      slug: input.slug,
      method_id: input.methodId ?? null,
      shape_id: input.shapeId ?? "",
      header: (input.header ?? null) as never,
      author: (input.author ?? null) as never,
      sections: input.sections as never,
      image_slots: input.imageSlots as never,
      comments: input.comments as never,
      theme: (input.theme ?? null) as never,
    })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo guardar la página: ${error.message}`);
  return toLanding(data);
}

export async function listLandings(productId: string): Promise<LandingPage[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("landing_pages")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las páginas: ${error.message}`);
  return (data ?? []).map(toLanding);
}

export async function readLanding(id: string): Promise<LandingPage | null> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("landing_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la página: ${error.message}`);
  return data ? toLanding(data) : null;
}

export async function deleteLanding(id: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from("landing_pages").delete().eq("id", id);
}

/** Anota la URL de Shopify de una imagen, para no volver a subirla. */
export async function setShopifyUrl(imageId: string, url: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from("product_images").update({ shopify_url: url }).eq("id", imageId);
}

/** Deja constancia de dónde quedó publicada la página. */
/**
 * Marca la página como publicada, o la desvincula con `null`.
 *
 * Admite `null` porque hace falta poder olvidar la página de Shopify sin borrar
 * la de aquí: es lo que pasa cuando se borra desde el panel de Shopify y la
 * plataforma se queda guardando un identificador que ya no apunta a nada.
 */
export async function markLandingPublished(
  id: string,
  shopifyPageId: string | null,
  url: string | null,
): Promise<void> {
  const { supabase } = await requireContext();

  await supabase
    .from("landing_pages")
    .update({
      shopify_page_id: shopifyPageId,
      shopify_url: url,
      // Al desvincular se borra también la fecha: decir «publicada el 3 de
      // marzo» de algo que ya no existe es peor que no decir nada.
      published_at: shopifyPageId ? new Date().toISOString() : null,
    })
    .eq("id", id);
}

/** Cambia los ajustes de una página sin tocar su contenido. */
export async function updateLandingSettings(
  id: string,
  patch: { hideThemeChrome?: boolean; utmCampaign?: string },
): Promise<void> {
  const { supabase } = await requireContext();

  const changes: { hide_theme_chrome?: boolean; utm_campaign?: string | null } = {};
  if (patch.hideThemeChrome !== undefined) changes.hide_theme_chrome = patch.hideThemeChrome;
  if (patch.utmCampaign !== undefined) changes.utm_campaign = patch.utmCampaign || null;

  if (Object.keys(changes).length === 0) return;

  const { error } = await supabase.from("landing_pages").update(changes).eq("id", id);
  if (error) throw new Error(`No se pudieron guardar los ajustes: ${error.message}`);
}

/**
 * Cambia solo los comentarios de una página.
 *
 * Va aparte de `saveLanding` porque esa crea una fila nueva: usarla para
 * añadirle comentarios a una copia dejaría dos páginas, la de antes sin ellos y
 * la de después con ellos, y publicando la que no toca.
 */
export async function updateLandingComments(
  id: string,
  comments: LandingComment[],
): Promise<void> {
  const { supabase } = await requireContext();

  /*
   * Y la sección que los pinta, si no está.
   *
   * Guardarlos sin ella los deja en la base de datos y **fuera de la página**:
   * el resumen decía «12 comentarios escritos» y en la vista previa no había
   * ninguno. Una copia trae solo secciones `crudo` —el marcado del original—,
   * así que no hay ningún sitio donde salgan a menos que se añada.
   *
   * Va al final, que es donde vive la prueba social en un publirreportaje.
   */
  const page = await readLanding(id);

  const sections =
    page && !page.sections.some((section) => section.kind === "comentarios")
      ? [...page.sections, { kind: "comentarios" as const }]
      : page?.sections;

  const { error } = await supabase
    .from("landing_pages")
    .update(sections ? { comments, sections } : { comments })
    .eq("id", id);

  if (error) throw new Error(`No se pudieron guardar los comentarios: ${error.message}`);
}

/** Cambia solo las secciones. Mismo motivo que los comentarios: `saveLanding` crea otra fila. */
export async function updateLandingSections(
  id: string,
  sections: LandingSection[],
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("landing_pages").update({ sections }).eq("id", id);

  if (error) throw new Error(`No se pudieron guardar las secciones: ${error.message}`);
}
