/**
 * Trabajos en segundo plano.
 *
 * Vive aparte de la capa de datos porque los componentes de cliente necesitan
 * el tipo y aquella lleva `server-only`.
 */

export const JOB_KINDS = [
  "investigacion",
  "extraccion",
  "angulos",
  "ganchos",
  "copys",
  "anuncios",
  "competidores",
  "ideas",
  "imagenes",
  "ficha",
  "landing",
  "shopify",
  // Escribir en el tema: secciones nuevas y configuración.
  "tema",
  "datos",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  investigacion: "Investigación",
  extraccion: "Extracción",
  angulos: "Ángulos",
  ganchos: "Ganchos",
  copys: "Copys",
  anuncios: "Anuncios",
  competidores: "Competidores",
  ideas: "Ideas",
  imagenes: "Imágenes",
  ficha: "Ficha del producto",
  landing: "Página",
  shopify: "Shopify",
  tema: "Tema de la tienda",
  datos: "Datos de tienda",
};

export interface BackgroundJob {
  id: string;
  productId: string | null;
  kind: JobKind;
  /** Lo que se le enseña a la persona. */
  label: string;
  status: "running" | "done" | "error";
  summary: string | null;
  error: string | null;
  /** Payload para los trabajos cuyo resultado la interfaz necesita en mano. */
  result: unknown;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * Un trabajo «en marcha» que lleva demasiado tiempo así.
 *
 * Si el servidor se reinicia a media generación, nadie actualiza la fila y se
 * queda colgada para siempre: la interfaz sondearía sin fin y el botón seguiría
 * bloqueado. Pasado este plazo se da por perdido.
 *
 * Media hora es holgado a propósito — una tanda de investigación con búsqueda
 * web puede pasar de diez minutos, y matar un trabajo vivo sería peor.
 */
export const JOB_STALE_MS = 30 * 60 * 1000;

export function isStale(job: BackgroundJob, now = Date.now()): boolean {
  if (job.status !== "running") return false;
  return now - new Date(job.createdAt).getTime() > JOB_STALE_MS;
}

/**
 * Lo que devuelve un botón de generar.
 *
 * Ya no devuelve el resultado, porque el trabajo empieza después de responder.
 * Devuelve o bien el trabajo que quedó en marcha, o bien —cuando no había nada
 * que hacer— la razón, sin gastar nada ni crear un trabajo vacío.
 *
 * El discriminante `started` obliga al que llama a tratar los dos casos; sin él
 * se olvidaría el segundo y la interfaz se quedaría muda.
 */
export type LaunchResult =
  | { started: false; message: string }
  | { started: true; jobId: string; label: string };
