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
 * De ahí la regla de este archivo: **toda consulta lleva su `workspace_id`**,
 * con dos excepciones y solo dos: `contarUltimas24h` y `ultimaPublicacion`.
 * Ambas filtran por `ig_user_id`, no por espacio, porque el tope de 25/24h y
 * la separación mínima los impone Instagram sobre **la cuenta real**, no sobre
 * el espacio interno — filtrar por espacio daría un recuento que permite
 * pasarse del límite que de verdad importa. Las dos devuelven solo agregados
 * de filas ya públicas (`status = 'publicado'`), nunca contenido. Cualquier
 * otra consulta sin espacio es un fallo: devuelve las publicaciones de otro
 * cliente sin dar ningún error, que es la peor forma que tiene un fallo de
 * manifestarse.
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

  const { data, error } = await supabase
    .from("instagram_autopilot")
    .select("*")
    .eq("activo", true)
    .eq("pausado_por", "")
    .not("ig_user_id", "is", null)
    .not("workspace_id", "is", null);

  if (error) {
    throw new Error(`No se pudieron listar los autopilotos activos: ${error.message}`);
  }

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

  const { count, error } = await supabase
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .eq("ig_user_id", igUserId)
    .eq("status", "publicado")
    .gte("published_at", desde);

  if (error) {
    throw new Error(
      `No se pudo contar las publicaciones de las últimas 24h de ${igUserId}: ${error.message}`,
    );
  }

  return count ?? 0;
}

/** Cuándo salió la última de esa cuenta, para la separación mínima. */
export async function ultimaPublicacion(igUserId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("instagram_posts")
    .select("published_at")
    .eq("ig_user_id", igUserId)
    .eq("status", "publicado")
    // `DESC` en Postgres es `NULLS FIRST` por defecto, y la columna es
    // nullable: sin este filtro, una fila publicada con fecha nula se
    // colaría primero y apagaría la separación mínima para siempre.
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`No se pudo leer la última publicación de ${igUserId}: ${error.message}`);
  }

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

  const { data, error } = await supabase
    .from("instagram_posts")
    .select("id, scheduled_at")
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .eq("status", "aprobado")
    .not("media_url", "is", null)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudo listar la cola de ${productId}: ${error.message}`);
  }

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
 * En dos pasos: se elige el candidato ordenado, y se marca repitiendo **el
 * mismo predicado completo** con el que se eligió, no el estado que se leyó.
 *
 * Repetir el estado leído (`status = candidato.status`) no basta en la rama
 * de fila colgada: si el candidato ya estaba en `publicando`, dos vueltas
 * solapadas ejecutan `update ... where status = 'publicando'` y el predicado
 * sigue siendo cierto después de que la primera haga commit — las dos lo
 * pasan y las dos publican. Repitiendo el `or` completo, tras el primer
 * commit `claimed_at` vale `ahora`, que ya no es anterior a `muerta`, así que
 * la segunda vuelta no encuentra nada que actualizar — que es exactamente lo
 * que evita la doble publicación.
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
  const predicado = `status.eq.aprobado,and(status.eq.publicando,claimed_at.lt.${muerta})`;

  const { data: candidatos, error: errorCandidatos } = await supabase
    .from("instagram_posts")
    .select("id")
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .lte("scheduled_at", ahora.toISOString())
    .not("media_url", "is", null)
    .or(predicado)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (errorCandidatos) {
    throw new Error(
      `No se pudo buscar una pieza vencida de ${row.productId}: ${errorCandidatos.message}`,
    );
  }

  const candidato = (candidatos ?? [])[0];
  if (!candidato) return null;

  const { data: reservadas, error: errorReserva } = await supabase
    .from("instagram_posts")
    .update({ status: "publicando", claimed_at: ahora.toISOString() })
    .eq("id", candidato.id)
    .eq("workspace_id", row.workspaceId)
    .or(predicado)
    .select("id, caption, media_url, format, media_kind");

  if (errorReserva) {
    throw new Error(`No se pudo reservar la pieza ${candidato.id}: ${errorReserva.message}`);
  }

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

  const consulta = supabase
    .from("instagram_posts")
    .update(
      outcome.instagramId
        ? {
            status: "publicado",
            instagram_id: outcome.instagramId,
            // Solo si viene: escribir `null` aquí borraría la cuenta de una
            // publicación que sí salió, y esa columna es el único filtro de
            // `contarUltimas24h` y `ultimaPublicacion` — la dejaría invisible
            // para el tope y la separación mínima de esa cuenta.
            ...(outcome.igUserId !== undefined ? { ig_user_id: outcome.igUserId } : {}),
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

  /*
   * Revertir a «aprobado» exige que la fila siga en «publicando».
   *
   * Sin este filtro, una llamada tardía con `error` —por ejemplo porque quien
   * llamó ya la había cerrado con éxito antes y solo falló algo después—
   * volvería a «aprobado» una pieza que **ya está publicada de verdad** en
   * Instagram, y la vuelta siguiente la reservaría y la publicaría otra vez.
   * Es la misma doctrina que `reservarVencida`: la condición va en la
   * consulta, no en la confianza de quien llama.
   */
  const { error } = outcome.instagramId ? await consulta : await consulta.eq("status", "publicando");

  if (error) {
    throw new Error(`No se pudo cerrar la publicación ${id}: ${error.message}`);
  }
}

/**
 * Las recién escritas que aún no tienen media ni hora — sin las de vídeo.
 *
 * El vídeo no se genera solo todavía (`rellenar`, en la ruta del cron, lo
 * escribe pero no lo completa), así que una pieza de vídeo nunca dejaría de
 * cumplir «sin media». Si esta consulta la devolviera, ocuparía para siempre
 * las primeras posiciones de la ventana de relleno (`slice(0, cuantas)` en el
 * llamador) y ninguna imagen llegaría a generarse detrás de ella. Se cuentan
 * aparte, con `contarEsperandoVideo`, para poder avisar sin bloquear la cola.
 */
export async function listasSinMedia(row: {
  productId: string;
  workspaceId: string;
}): Promise<{ id: string }[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("instagram_posts")
    .select("id")
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .eq("status", "aprobado")
    .neq("media_kind", "video")
    .is("media_url", null)
    .is("scheduled_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `No se pudo listar lo pendiente de media de ${row.productId}: ${error.message}`,
    );
  }

  return (data ?? []).map((one) => ({ id: one.id }));
}

/** Cuántas piezas del producto están escritas y esperan un vídeo que no se genera solo. */
export async function contarEsperandoVideo(row: {
  productId: string;
  workspaceId: string;
}): Promise<number> {
  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .eq("status", "aprobado")
    .eq("media_kind", "video")
    .is("media_url", null)
    .is("scheduled_at", null);

  if (error) {
    throw new Error(`No se pudo contar lo que espera vídeo de ${row.productId}: ${error.message}`);
  }

  return count ?? 0;
}

/** Le pone la hora, ya con imagen. */
export async function programar(id: string, workspaceId: string, cuando: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("instagram_posts")
    .update({ scheduled_at: cuando })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`No se pudo programar la publicación ${id}: ${error.message}`);
  }
}

/**
 * El token con el que se publica.
 *
 * Se elige el acceso de Meta que **tenga el permiso de publicar**, no el
 * primero: la conexión de anuncios nació con `ads_read` a secas y con ella el
 * contenedor falla con un error que no dice que faltaba un permiso.
 */
export async function tokenDePublicacion(userId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("meta_logins")
    .select("access_token, scopes, token_expires_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron leer las conexiones de Meta de ${userId}: ${error.message}`);
  }

  const valido = (data ?? []).find(
    (one) =>
      (one.scopes ?? []).includes("instagram_content_publish") &&
      (!one.token_expires_at || new Date(one.token_expires_at) > new Date()),
  );

  if (!valido) {
    throw new Error(
      "Ninguna conexión de Meta tiene permiso para publicar en Instagram. Reautoriza con instagram_content_publish.",
    );
  }

  return valido.access_token;
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

  const { data, error: errorLectura } = await supabase
    .from("instagram_autopilot")
    .select("fallos_seguidos")
    .eq("product_id", productId)
    .limit(1);

  if (errorLectura) {
    throw new Error(`No se pudo leer los fallos seguidos de ${productId}: ${errorLectura.message}`);
  }

  const seguidos = ((data ?? [])[0]?.fallos_seguidos ?? 0) + 1;
  const pausar = permanente || seguidos >= 3;

  const { error: errorEscritura } = await supabase
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

  if (errorEscritura) {
    throw new Error(`No se pudo anotar el fallo de ${productId}: ${errorEscritura.message}`);
  }
}

/**
 * Salió bien: se borra la cuenta de fallos y se anota cuándo.
 *
 * No toca `pausado_por`. `listarActivos` ya excluye las filas pausadas, así
 * que si esta función se llama es porque la fila no estaba pausada al
 * empezar la vuelta — y si alguien la pausó a mano mientras tanto, borrar el
 * motivo aquí se llevaría esa pausa por delante sin que nadie lo pidiera.
 */
export async function limpiarFallos(productId: string, cuando: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("instagram_autopilot")
    .update({ fallos_seguidos: 0, ultima_publicacion_at: cuando })
    .eq("product_id", productId);

  if (error) {
    throw new Error(`No se pudo limpiar los fallos de ${productId}: ${error.message}`);
  }
}
