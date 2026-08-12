import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * La cola vista desde el cron, que no es nadie.
 *
 * ## Por qué esta capa existe además de `data/instagram.ts`
 *
 * Porque aquella pasa por `requireContext()`, que redirige a la entrada cuando
 * no hay sesión: llamada desde un cron no falla con un mensaje raro, **redirige
 * un proceso que no tiene navegador**. Y porque el cliente que usa salta RLS,
 * así que la seguridad deja de ponerla la base de datos.
 *
 * De ahí la regla de este archivo, que se cumple sin excepciones: **toda
 * consulta lleva su `workspace_id`**. Una que no lo lleve devuelve las
 * publicaciones de otro cliente sin dar ningún error, que es la peor forma que
 * tiene un fallo de manifestarse.
 */

export interface AutopilotRow {
  productId: string;
  userId: string;
  workspaceId: string;
  igUserId: string;
  porDia: number;
  colchonDias: number;
  horaDesde: number;
  horaHasta: number;
  ultimaPublicacionAt: string | null;
  fallosSeguidos: number;
  pausadoPor: string;
}

/**
 * Los que publican solos: activos, sin pausar, con cuenta y con espacio.
 *
 * Sin `workspace_id` la fila no se puede escribir de vuelta sin arriesgarse a
 * tocar otra, así que se descarta aquí en vez de arrastrar un `null` hasta el
 * bucle.
 */
export async function listarActivos(): Promise<AutopilotRow[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_autopilot")
    .select("*")
    .eq("activo", true)
    .eq("pausado_por", "")
    .not("ig_user_id", "is", null)
    .not("workspace_id", "is", null);

  return (data ?? []).map((row) => ({
    productId: row.product_id,
    userId: row.user_id,
    workspaceId: row.workspace_id as string,
    igUserId: row.ig_user_id as string,
    porDia: row.por_dia,
    colchonDias: row.colchon_dias,
    horaDesde: row.hora_desde,
    horaHasta: row.hora_hasta,
    ultimaPublicacionAt: row.ultima_publicacion_at,
    fallosSeguidos: row.fallos_seguidos,
    pausadoPor: row.pausado_por,
  }));
}

/** Cuántas salieron por esa cuenta en 24 horas. El tope es de la cuenta. */
export async function contarUltimas24h(igUserId: string): Promise<number> {
  const supabase = createAdminClient();
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .eq("ig_user_id", igUserId)
    .eq("status", "publicado")
    .gte("published_at", desde);

  return count ?? 0;
}

/** Cuándo salió la última de esa cuenta, para la separación mínima. */
export async function ultimaPublicacion(igUserId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_posts")
    .select("published_at")
    .eq("ig_user_id", igUserId)
    .eq("status", "publicado")
    .order("published_at", { ascending: false })
    .limit(1);

  return (data ?? [])[0]?.published_at ?? null;
}

/**
 * Las que van a salir: aprobadas, con media, con fecha por delante.
 *
 * Los borradores no entran aunque tengan imagen y fecha: `reservarVencida` solo
 * coge aprobadas, así que un borrador no se publica solo nunca. Contándolos, el
 * colchón se llenaría de piezas muertas y la cuenta dejaría de publicar creyendo
 * que va sobrada — que es el fallo peor, porque no se nota.
 */
export async function listasDe(
  productId: string,
  workspaceId: string,
): Promise<{ id: string; scheduledAt: string }[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_posts")
    .select("id, scheduled_at")
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .eq("status", "aprobado")
    .not("media_url", "is", null)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    scheduledAt: row.scheduled_at as string,
  }));
}

/**
 * Coge la pieza vencida más atrasada y la marca como suya.
 *
 * ## Por qué en dos pasos y no en un solo `update`
 *
 * Porque `.limit(1)` sobre un `update` de PostgREST acota **lo que se devuelve**,
 * no lo que se toca: un solo `update` con filtro puede marcar como «publicando»
 * todas las piezas vencidas y devolver una. Las demás quedan bloqueadas media
 * hora sin que nadie las publique.
 *
 * En dos pasos: se elige el candidato ordenado, y se marca **por su id y solo si
 * sigue aprobado**. Si otra vuelta llegó antes, el `update` no encuentra nada y
 * devuelve vacío — que es exactamente lo que evita la doble publicación.
 */
export async function reservarVencida(row: AutopilotRow): Promise<{
  id: string;
  caption: string;
  mediaUrl: string;
  format: string;
  mediaKind: string;
} | null> {
  const supabase = createAdminClient();

  const ahora = new Date();
  const muerta = new Date(ahora.getTime() - 30 * 60 * 1000).toISOString();

  const { data: candidatos } = await supabase
    .from("instagram_posts")
    .select("id, status, claimed_at")
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .lte("scheduled_at", ahora.toISOString())
    .not("media_url", "is", null)
    .or(`status.eq.aprobado,and(status.eq.publicando,claimed_at.lt.${muerta})`)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const candidato = (candidatos ?? [])[0];
  if (!candidato) return null;

  const { data: reservadas } = await supabase
    .from("instagram_posts")
    .update({ status: "publicando", claimed_at: ahora.toISOString() })
    .eq("id", candidato.id)
    .eq("workspace_id", row.workspaceId)
    // La condición es la del estado que se leyó: si cambió entre la lectura y
    // ahora, esta vuelta se queda sin nada y la otra publica.
    .eq("status", candidato.status)
    .select("id, caption, media_url, format, media_kind");

  const pieza = (reservadas ?? [])[0];
  if (!pieza) return null;

  return {
    id: pieza.id,
    caption: pieza.caption,
    mediaUrl: pieza.media_url as string,
    format: pieza.format,
    mediaKind: pieza.media_kind,
  };
}

/** Cierra una publicación: salió o no salió, y por dónde salió. */
export async function cerrarPublicacion(
  id: string,
  workspaceId: string,
  outcome: { instagramId?: string; igUserId?: string; error?: string },
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("instagram_posts")
    .update(
      outcome.instagramId
        ? {
            status: "publicado",
            instagram_id: outcome.instagramId,
            ig_user_id: outcome.igUserId ?? null,
            published_at: new Date().toISOString(),
            error: "",
          }
        : {
            /*
             * Vuelve a «aprobado», no a «error»: un fallo de red o un procesado
             * lento no significan que la pieza esté mal, sino que no salió esta
             * vez. En «error» se quedaría fuera para siempre.
             */
            status: "aprobado",
            claimed_at: null,
            error: outcome.error ?? "falló sin motivo",
          },
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId);
}

/**
 * Anota el fallo y pausa si toca.
 *
 * Lo permanente pausa a la primera: un token caducado no se arregla esperando, y
 * reintentarlo cada cinco minutos son 288 fallos al día que nadie lee. Lo
 * transitorio pausa a los tres seguidos.
 */
export async function anotarFallo(
  productId: string,
  motivo: string,
  permanente: boolean,
): Promise<void> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("instagram_autopilot")
    .select("fallos_seguidos")
    .eq("product_id", productId)
    .limit(1);

  const seguidos = ((data ?? [])[0]?.fallos_seguidos ?? 0) + 1;
  const pausar = permanente || seguidos >= 3;

  await supabase
    .from("instagram_autopilot")
    .update({
      fallos_seguidos: seguidos,
      pausado_por: pausar
        ? permanente
          ? motivo
          : `Tres intentos seguidos sin salir. El último: ${motivo}`
        : "",
    })
    .eq("product_id", productId);
}

/** Salió bien: se borra la cuenta de fallos y se anota cuándo. */
export async function limpiarFallos(productId: string, cuando: string): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("instagram_autopilot")
    .update({ fallos_seguidos: 0, pausado_por: "", ultima_publicacion_at: cuando })
    .eq("product_id", productId);
}
