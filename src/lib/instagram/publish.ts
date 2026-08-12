import "server-only";

import { InstagramError } from "./errors.ts";

/**
 * Publicar en Instagram: contenedor, espera y publicación.
 *
 * ## Son dos pasos y una espera, no una llamada
 *
 * Primero se crea un **contenedor** con la media; Instagram la descarga y la
 * procesa —los vídeos tardan— y hasta que no termina no se puede publicar.
 * Publicar antes de tiempo devuelve un error que no dice que había que esperar.
 *
 * ## La media se sube por dirección, no como archivo
 *
 * Instagram la descarga de donde se le diga, así que esa dirección tiene que
 * ser accesible **sin firmar**. Una dirección firmada de nuestro bucket funciona
 * mientras no caduque: si caduca entre el contenedor y la publicación, falla a
 * mitad y la pieza queda sin salir sin motivo aparente.
 */

const GRAPH = "https://graph.facebook.com";

function version(): string {
  return process.env.META_API_VERSION?.trim() || "v26.0";
}

interface Cuenta {
  igUserId: string;
  token: string;
}

async function graph(
  path: string,
  token: string,
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}/${version()}/${path}`);
  url.searchParams.set("access_token", token);

  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    ...(body ? { body: new URLSearchParams(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    /*
     * El mensaje de Meta se devuelve tal cual, y el código va aparte.
     *
     * Los suyos dicen qué pasó —«la cuenta no es profesional», «el vídeo dura
     * demasiado»— y traducirlos a «no se pudo publicar» obliga a ir al registro
     * para averiguar lo que ya venía escrito. Pero decidir **si se reintenta**
     * leyendo ese texto es frágil: se decide por el código.
     */
    const error = (data.error ?? {}) as {
      message?: string;
      code?: number;
      error_subcode?: number;
    };

    throw new InstagramError(
      error.message ?? `Instagram respondió ${response.status}.`,
      Number(error.code ?? 0),
      Number(error.error_subcode ?? 0),
    );
  }

  return data;
}

/** Crea el contenedor. Devuelve su identificador, que no es el de la publicación. */
export async function createContainer(
  cuenta: Cuenta,
  input: { mediaUrl: string; caption: string; kind: string; isStory: boolean },
): Promise<string> {
  const body: Record<string, string> = { caption: input.caption };

  if (input.kind === "video") {
    body.media_type = input.isStory ? "STORIES" : "REELS";
    body.video_url = input.mediaUrl;
  } else {
    if (input.isStory) body.media_type = "STORIES";
    body.image_url = input.mediaUrl;
  }

  const data = await graph(`${cuenta.igUserId}/media`, cuenta.token, body);
  const id = String(data.id ?? "");

  if (!id) throw new Error("Instagram no devolvió el contenedor.");

  return id;
}

/**
 * Espera a que el contenedor esté listo.
 *
 * Se pregunta en vez de esperar un rato fijo: una imagen tarda segundos y un
 * vídeo puede tardar minutos, y un tiempo fijo o se queda corto con el vídeo o
 * hace esperar de más a todo lo demás.
 */
export async function waitForContainer(
  cuenta: Cuenta,
  containerId: string,
  intentos = 20,
): Promise<void> {
  for (let i = 0; i < intentos; i += 1) {
    const data = await graph(
      `${containerId}?fields=status_code,status`,
      cuenta.token,
    );

    const status = String(data.status_code ?? "");

    if (status === "FINISHED") return;

    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(String(data.status ?? "Instagram no pudo procesar la media."));
    }

    await new Promise((listo) => setTimeout(listo, 5_000));
  }

  throw new Error("Instagram sigue procesando la media después de dos minutos.");
}

/** Publica el contenedor ya listo. Devuelve el identificador de la publicación. */
export async function publishContainer(cuenta: Cuenta, containerId: string): Promise<string> {
  const data = await graph(`${cuenta.igUserId}/media_publish`, cuenta.token, {
    creation_id: containerId,
  });

  const id = String(data.id ?? "");

  if (!id) throw new Error("Instagram no devolvió el identificador de la publicación.");

  return id;
}

/** Los tres pasos, en orden. */
export async function publishNow(
  cuenta: Cuenta,
  input: { mediaUrl: string; caption: string; kind: string; isStory: boolean },
): Promise<string> {
  const container = await createContainer(cuenta, input);

  await waitForContainer(cuenta, container);

  return publishContainer(cuenta, container);
}
