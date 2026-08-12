import "server-only";

import { requireContext } from "@/lib/supabase/session";

/** Una publicación en la cola. */
export interface Post {
  id: string;
  productId: string;
  format: string;
  caption: string;
  hashtags: string[];
  scene: string;
  mediaUrl: string | null;
  /** Si el producto sale. Decide si se usa su foto de referencia al generar. */
  showsProduct: boolean;
  mediaKind: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  error: string;
}

const readRow = (row: {
  id: string;
  product_id: string;
  format: string;
  caption: string;
  hashtags: string[];
  scene: string;
  media_url: string | null;
  shows_product: boolean;
  media_kind: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  error: string;
}): Post => ({
  id: row.id,
  productId: row.product_id,
  format: row.format,
  caption: row.caption,
  hashtags: row.hashtags ?? [],
  scene: row.scene,
  mediaUrl: row.media_url,
  showsProduct: row.shows_product,
  mediaKind: row.media_kind,
  status: row.status,
  scheduledAt: row.scheduled_at,
  publishedAt: row.published_at,
  error: row.error,
});

/**
 * La cola de un producto, lo próximo primero.
 *
 * Las que no tienen hora van al final: son borradores sin programar, y lo que
 * hay que mirar cada día es lo que está a punto de salir.
 */
export async function listPosts(productId: string): Promise<Post[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("product_id", productId)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (data ?? []).map(readRow);
}

export async function addPosts(
  productId: string,
  posts: {
    format: string;
    caption: string;
    hashtags: string[];
    scene: string;
    showsProduct: boolean;
    mediaKind: string;
  }[],
): Promise<number> {
  const { supabase, userId } = await requireContext();

  if (posts.length === 0) return 0;

  const { data } = await supabase
    .from("instagram_posts")
    .insert(
      posts.map((one) => ({
        user_id: userId,
        product_id: productId,
        format: one.format,
        caption: one.caption,
        hashtags: one.hashtags,
        scene: one.scene,
        shows_product: one.showsProduct,
        media_kind: one.mediaKind,
        // Nacen en borrador, siempre. Nada sale a la cuenta de la marca sin que
        // alguien lo haya leído.
        status: "borrador",
      })),
    )
    .select("id");

  return (data ?? []).length;
}

export async function updatePost(
  id: string,
  patch: { caption?: string; scheduledAt?: string | null; status?: string },
): Promise<void> {
  const { supabase } = await requireContext();

  await supabase
    .from("instagram_posts")
    .update({
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.scheduledAt !== undefined ? { scheduled_at: patch.scheduledAt } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    })
    .eq("id", id);
}

export async function deletePost(id: string): Promise<void> {
  const { supabase } = await requireContext();

  await supabase.from("instagram_posts").delete().eq("id", id);
}

/** Ata la media a su publicación. Ver la acción: suelta no sirve de nada. */
export async function updatePostMedia(id: string, mediaUrl: string): Promise<void> {
  const { supabase } = await requireContext();

  await supabase.from("instagram_posts").update({ media_url: mediaUrl }).eq("id", id);
}
