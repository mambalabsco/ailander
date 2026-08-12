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
  /**
   * Si nacen aprobadas.
   *
   * Por defecto no: nada sale a la cuenta de la marca sin que alguien lo lea.
   * En automático sí, y quien lo enciende acepta que no lo va a leer nadie.
   */
  approved = false,
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
        status: approved ? "aprobado" : "borrador",
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

/* ------------------------------ Para el cron -------------------------------- */

/**
 * Coge una publicación que toque, y la marca como suya **en la misma consulta**.
 *
 * ## Por qué en una sola consulta
 *
 * Porque el cron se ejecuta cada pocos minutos y publicar tarda. Leyendo primero
 * y marcando después, dos vueltas pueden leer la misma fila antes de que ninguna
 * la marque — y sale publicada dos veces. En la cuenta de la marca eso no se
 * deshace: se borra a mano y ya lo vio todo el mundo.
 *
 * Con el `update ... where status = 'aprobado'` la base decide: la primera
 * cambia la fila y la segunda no encuentra nada que cambiar.
 *
 * ## Y por qué se puede recuperar una colgada
 *
 * Si el proceso muere entre marcar y publicar, la fila se queda en «publicando»
 * para siempre. Media hora es de sobra para el vídeo más lento: pasado ese
 * plazo se puede volver a coger.
 */
export async function claimDuePost(): Promise<Post | null> {
  const { supabase } = await requireContext();

  const ahora = new Date();
  const muerta = new Date(ahora.getTime() - 30 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("instagram_posts")
    .update({ status: "publicando", claimed_at: ahora.toISOString() })
    .lte("scheduled_at", ahora.toISOString())
    .not("media_url", "is", null)
    .or(`status.eq.aprobado,and(status.eq.publicando,claimed_at.lt.${muerta})`)
    .select("*")
    .limit(1);

  const row = (data ?? [])[0];

  return row ? readRow(row) : null;
}

/** Cierra una publicación: salió o no salió, y con qué identificador. */
export async function finishPost(
  id: string,
  outcome: { instagramId?: string; igUserId?: string; error?: string },
): Promise<void> {
  const { supabase } = await requireContext();

  await supabase
    .from("instagram_posts")
    .update(
      outcome.instagramId
        ? {
            status: "publicado",
            instagram_id: outcome.instagramId,
            // Solo si viene: sin esto, una pieza publicada fuera del cron no
            // cuenta para el tope de la cuenta y el autopiloto cree que le
            // queda cupo cuando no le queda.
            ...(outcome.igUserId !== undefined ? { ig_user_id: outcome.igUserId } : {}),
            published_at: new Date().toISOString(),
            error: "",
          }
        : {
            /*
             * Vuelve a «aprobado», no a «error».
             *
             * Un fallo de red o un procesado lento no significan que la pieza
             * esté mal: significan que no salió esta vez. Dejándola en error se
             * queda fuera para siempre y hay que rescatarla a mano.
             */
            status: "aprobado",
            claimed_at: null,
            error: outcome.error ?? "falló sin motivo",
          },
    )
    .eq("id", id);
}
