import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { TOPE_INTENTOS_MEDIA } from "@/lib/instagram/autopilot";

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
 * con cuatro excepciones y solo cuatro: `contarUltimas24h`, `ultimaPublicacion`,
 * el arriendo de la vuelta (`tomarVuelta` / `soltarVuelta`) y `listarActivos`.
 *
 * Están enumeradas porque una regla con excepciones sin declarar no sirve de
 * nada: quien audite el archivo de un vistazo cuenta las que faltan, y si son
 * más de las que dice la cabecera deja de fiarse de la cabecera. Tres funciones
 * llegaron a incumplirla sin decirlo —`listarActivos`, `anotarFallo` y
 * `limpiarFallos`, las tres acotando solo por `product_id`—. Las dos últimas ya
 * llevan su espacio; la primera no puede.
 *
 * Las dos primeras filtran por `ig_user_id`, no por espacio, porque el tope de
 * 25/24h y la separación mínima los impone Instagram sobre **la cuenta real**,
 * no sobre el espacio interno — filtrar por espacio daría un recuento que
 * permite pasarse del límite que de verdad importa. Las dos devuelven solo
 * agregados de filas ya públicas (`status = 'publicado'`), nunca contenido.
 * Cualquier otra consulta sin espacio es un fallo: devuelve las publicaciones
 * de otro cliente sin dar ningún error, que es la peor forma que tiene un fallo
 * de manifestarse.
 *
 * La tercera, el arriendo, no toca contenido de nadie: es el semáforo que
 * impide que dos vueltas del cron corran a la vez, y es uno para todo el
 * servidor, no uno por espacio.
 *
 * La cuarta, `listarActivos`, es la que **descubre** los espacios: es la única
 * consulta que no puede llevar el filtro porque su respuesta es precisamente
 * qué espacios hay que recorrer. A cambio no devuelve contenido —solo la
 * configuración del piloto— y descarta las filas sin espacio, de modo que todo
 * lo que sale de ella ya trae el `workspace_id` con el que se acota lo demás.
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
  /** IANA. En qué reloj se lee la ventana: sin esto sería la del servidor. */
  zonaHoraria: string;
  ultimaPublicacionAt: string | null;
  fallosSeguidos: number;
  pausadoPor: string;
}

/**
 * Minutos tras los que una vuelta que no soltó el arriendo se da por muerta.
 *
 * El mismo criterio que el rescate de `reservarVencida`, y por el mismo motivo:
 * si el proceso muere entre tomar y soltar, sin plazo el arriendo se queda
 * tomado para siempre y el autopiloto no vuelve a publicar nunca — callado.
 */
const ARRIENDO_MUERTO_MINUTOS = 30;

/**
 * Coge el turno de esta vuelta, o dice que no hay.
 *
 * ## Por qué hace falta si el `crontab` ya lleva `flock`
 *
 * Porque `flock` solo cubre al cron. La ruta es HTTP y responde a cualquiera
 * que traiga el secreto: una llamada a mano desde el portátil mientras el cron
 * está dentro no la ve ningún `flock`, y son justo las dos vueltas que se
 * pisan. Dos vueltas a la vez publican dos piezas distintas con segundos de
 * diferencia —cada una leyó el tope y la última publicación antes de que la
 * otra escribiera— saltándose los 90 minutos y sumando las dos contra el tope
 * del día.
 *
 * Devuelve el token con el que soltarlo, o `null` si lo tiene otra vuelta.
 */
export async function tomarVuelta(nombre = "instagram"): Promise<string | null> {
  const supabase = createAdminClient();

  const ahora = new Date();
  const muerta = new Date(ahora.getTime() - ARRIENDO_MUERTO_MINUTOS * 60 * 1000).toISOString();
  const token = crypto.randomUUID();

  /*
   * La fila se crea la primera vez y nunca más.
   *
   * `ignoreDuplicates` es un `on conflict do nothing`: sin él, el alta de cada
   * vuelta pisaría el `tomado_at` de la vuelta que está corriendo y el arriendo
   * no serviría para nada.
   */
  const { error: errorAlta } = await supabase
    .from("cron_arriendos")
    .upsert(
      { nombre, tomado_at: null, token: "" },
      { onConflict: "nombre", ignoreDuplicates: true },
    );

  if (errorAlta) {
    throw new Error(`No se pudo preparar el arriendo ${nombre}: ${errorAlta.message}`);
  }

  // Quién se lo queda lo decide la base, no quien llama: el `update` con el
  // predicado dentro solo cambia la fila si sigue libre o si ya venció.
  const { data, error } = await supabase
    .from("cron_arriendos")
    .update({ tomado_at: ahora.toISOString(), token })
    .eq("nombre", nombre)
    .or(`tomado_at.is.null,tomado_at.lt.${muerta}`)
    .select("nombre");

  if (error) {
    throw new Error(`No se pudo tomar el arriendo ${nombre}: ${error.message}`);
  }

  return (data ?? []).length > 0 ? token : null;
}

/**
 * Suelta el turno, y solo si sigue siendo el nuestro.
 *
 * El filtro por token no es adorno: una vuelta que se pasó de los treinta
 * minutos ya no tiene el arriendo —lo rescató la siguiente— y soltarlo al
 * terminar dejaría a dos vueltas corriendo a la vez, que es exactamente lo que
 * esto existe para evitar.
 */
export async function soltarVuelta(token: string, nombre = "instagram"): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("cron_arriendos")
    .update({ tomado_at: null, token: "" })
    .eq("nombre", nombre)
    .eq("token", token);

  if (error) {
    throw new Error(`No se pudo soltar el arriendo ${nombre}: ${error.message}`);
  }
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
    // Vacío no: una cadena vacía no es una zona y `Intl` la rechaza. UTC es lo
    // que hacía antes de que la columna existiera.
    zonaHoraria: row.zona_horaria || "UTC",
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
 *
 * Y tampoco devuelve las que ya agotaron sus intentos: regenerar la imagen de
 * una pieza que falla siempre son 288 generaciones pagadas al día, para
 * siempre. Se cuentan con `contarSinImagen` para poder decirlo.
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
    .lt("intentos_media", TOPE_INTENTOS_MEDIA)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `No se pudo listar lo pendiente de media de ${row.productId}: ${error.message}`,
    );
  }

  return (data ?? []).map((one) => ({ id: one.id }));
}

/**
 * Anota que se le intentó generar la imagen y no salió.
 *
 * Al agotar los intentos el motivo se escribe en la fila, no solo en el parte:
 * el parte vive en un archivo de registro del servidor y la pieza se quedaría
 * en la cola, aprobada y sin imagen, sin que nada explicara por qué no sale. En
 * `error` lo enseña la propia cola, en rojo, donde se mira.
 *
 * Devuelve cuántos intentos lleva ya.
 */
export async function anotarIntentoMedia(
  row: { productId: string; workspaceId: string },
  id: string,
  motivo: string,
): Promise<number> {
  const supabase = createAdminClient();

  const { data, error: errorLectura } = await supabase
    .from("instagram_posts")
    .select("intentos_media")
    .eq("id", id)
    .eq("workspace_id", row.workspaceId)
    .limit(1);

  if (errorLectura) {
    throw new Error(`No se pudo leer los intentos de imagen de ${id}: ${errorLectura.message}`);
  }

  const intentos = ((data ?? [])[0]?.intentos_media ?? 0) + 1;
  const agotados = intentos >= TOPE_INTENTOS_MEDIA;

  const { error: errorEscritura } = await supabase
    .from("instagram_posts")
    .update({
      intentos_media: intentos,
      error: agotados
        ? `Sin imagen tras ${intentos} intentos: ${motivo}. Ya no se reintenta sola.`
        : motivo,
    })
    .eq("id", id)
    .eq("workspace_id", row.workspaceId);

  if (errorEscritura) {
    throw new Error(`No se pudo anotar el intento de imagen de ${id}: ${errorEscritura.message}`);
  }

  return intentos;
}

/** Cuántas piezas del producto se quedaron sin imagen tras agotar los intentos. */
export async function contarSinImagen(row: {
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
    .neq("media_kind", "video")
    .is("media_url", null)
    .gte("intentos_media", TOPE_INTENTOS_MEDIA);

  if (error) {
    throw new Error(
      `No se pudo contar lo atascado sin imagen de ${row.productId}: ${error.message}`,
    );
  }

  return count ?? 0;
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
 *
 * Se busca por **espacio de trabajo**, no por la persona que encendió el
 * piloto: `meta_logins` es del equipo, igual que todo lo demás desde agosto de
 * 2026, y quien conectó la cuenta con permiso de publicar no tiene por qué ser
 * quien configuró el autopiloto. Filtrando por `user_id` el desplegable del
 * panel ofrece conexiones que este cliente admin —que no pasa por RLS— nunca
 * iba a encontrar: la vuelta lanza «ninguna conexión tiene permiso», lo cuenta
 * como fallo permanente y pausa un piloto que la persona dejó, con razón,
 * convencida de que iba a funcionar.
 */
export async function tokenDePublicacion(workspaceId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("meta_logins")
    .select("access_token, scopes, token_expires_at")
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false });

  if (error) {
    throw new Error(
      `No se pudieron leer las conexiones de Meta del espacio ${workspaceId}: ${error.message}`,
    );
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
  row: { productId: string; workspaceId: string },
  motivo: string,
  permanente: boolean,
): Promise<void> {
  const supabase = createAdminClient();

  const { data, error: errorLectura } = await supabase
    .from("instagram_autopilot")
    .select("fallos_seguidos")
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId)
    .limit(1);

  if (errorLectura) {
    throw new Error(
      `No se pudo leer los fallos seguidos de ${row.productId}: ${errorLectura.message}`,
    );
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
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId);

  if (errorEscritura) {
    throw new Error(`No se pudo anotar el fallo de ${row.productId}: ${errorEscritura.message}`);
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
export async function limpiarFallos(
  row: { productId: string; workspaceId: string },
  cuando: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("instagram_autopilot")
    .update({ fallos_seguidos: 0, ultima_publicacion_at: cuando })
    .eq("workspace_id", row.workspaceId)
    .eq("product_id", row.productId);

  if (error) {
    throw new Error(`No se pudo limpiar los fallos de ${row.productId}: ${error.message}`);
  }
}
