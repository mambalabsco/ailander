/**
 * Sync (antes Sync Labs): poner la boca de un vídeo sobre otro audio.
 *
 * Sin imports, probado en `lipsync.test.ts`. Aquí solo está lo que se puede
 * decidir sin red: qué modelos hay, qué cuestan, qué cuerpo lleva la petición y
 * qué significa cada estado. La llamada vive en `providers.ts`.
 *
 * ## Para qué sirve dentro de un flujo
 *
 * Un clip de Seedance con sonido dice lo que el modelo decidió decir, con la
 * voz que le salió esa vez. La locución que sí está aprobada —la de ElevenLabs,
 * con su tono y sus tiempos— quedaba fuera del vídeo: se montaba encima y la
 * boca no cuadraba. Este nodo es lo que las junta.
 *
 * ## Lo que cuesta, dicho antes
 *
 * Se cobra **por segundo de vídeo**, no por llamada, y entre el más barato y el
 * mejor hay casi el triple. Un plano de quince segundos son ocho céntimos con
 * uno y veinte con otro; en un anuncio de seis planos eso ya no es ruido. Por
 * eso el coste está aquí y no en un aviso de la pantalla: entra en la barra de
 * costes del flujo como cualquier otro nodo.
 *
 * Los precios son el tramo alto de la tarifa publicada (agosto de 2026). Se
 * toma el alto a propósito: una estimación que se queda corta hace decidir mal.
 */

export interface LipsyncModel {
  id: string;
  label: string;
  /** Dólares por segundo de vídeo de salida. */
  usdPerSecond: number;
  note: string;
}

/**
 * Los modelos, del más barato al mejor.
 *
 * `react-1` no está: no hace lipsync sobre un audio dado, hace reacciones, y
 * meterlo en la misma lista invita a elegirlo para lo que no es.
 */
export const LIPSYNC_MODELS: LipsyncModel[] = [
  {
    id: "lipsync-2",
    label: "Lipsync 2",
    usdPerSecond: 0.05,
    note: "El equilibrado. Es el que vale para casi todo.",
  },
  {
    id: "lipsync-2-pro",
    label: "Lipsync 2 Pro",
    usdPerSecond: 0.083,
    note: "Conserva mejor barba y dientes. Tarda casi el doble.",
  },
  {
    id: "sync-3",
    label: "Sync 3",
    usdPerSecond: 0.133,
    note: "4K y detecta lo que tapa la cara. Para primeros planos y perfiles.",
  },
];

export function findLipsyncModel(id: string): LipsyncModel {
  return LIPSYNC_MODELS.find((model) => model.id === id) ?? LIPSYNC_MODELS[0];
}

/**
 * Qué hacer cuando el audio y el vídeo no duran lo mismo.
 *
 * Hay que elegirlo **siempre**, porque el que viene por defecto recorta. Un
 * plano de quince segundos con una locución de dieciocho pierde las tres
 * últimas palabras sin que nada avise, y esas tres suelen ser la llamada a la
 * acción.
 */
export const SYNC_MODES = [
  { id: "remap", label: "Ajustar la velocidad del vídeo", note: "Estira o encoge el vídeo para que cuadre. Lo normal." },
  { id: "loop", label: "Repetir el vídeo", note: "Vuelve a empezar hasta que el audio termina." },
  { id: "bounce", label: "Ir y volver", note: "Reproduce hacia delante y hacia atrás. Disimula bien en planos cortos." },
  { id: "silence", label: "Dejar en silencio", note: "Mantiene el vídeo y calla lo que sobra." },
  { id: "cut_off", label: "Cortar", note: "Corta al más corto de los dos. Puede comerse el final de la locución." },
] as const;

export function isSyncMode(value: string): boolean {
  return SYNC_MODES.some((mode) => mode.id === value);
}

/** Lo que va a costar, antes de gastarlo. */
export function lipsyncCostUsd(modelId: string, seconds: number): number {
  const model = findLipsyncModel(modelId);
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;

  return Math.round(model.usdPerSecond * safe * 10_000) / 10_000;
}

export interface LipsyncRequest {
  videoUrl: string;
  audioUrl: string;
  model?: string;
  syncMode?: string;
  /** Cuánta libertad tiene el modelo con la expresión. 0–1. */
  temperature?: number;
  /** Para caras tapadas por una mano, un micro o el propio producto. */
  detectOcclusion?: boolean;
}

/**
 * El cuerpo de `POST /v2/generate`.
 *
 * Se construye aquí y no en la función que llama para poder probarlo: el error
 * que costaría descubrir es mandar el audio como entrada de vídeo, y eso la API
 * lo contesta con un 422 que solo se ve en producción.
 */
export function buildLipsyncBody(request: LipsyncRequest): Record<string, unknown> {
  if (!request.videoUrl) throw new Error("El lipsync necesita un vídeo.");
  if (!request.audioUrl) throw new Error("El lipsync necesita un audio.");

  const model = findLipsyncModel(request.model ?? "").id;
  const mode = request.syncMode && isSyncMode(request.syncMode) ? request.syncMode : "remap";

  const options: Record<string, unknown> = { sync_mode: mode };

  /*
   * La temperatura solo va si se pidió. Mandar el valor por defecto explícito
   * no cambia nada hoy, pero fija un número que la API podría estar afinando.
   */
  if (typeof request.temperature === "number") {
    options.temperature = Math.min(1, Math.max(0, request.temperature));
  }

  if (request.detectOcclusion) options.occlusion_detection_enabled = true;

  return {
    model,
    input: [
      { type: "video", url: request.videoUrl },
      { type: "audio", url: request.audioUrl },
    ],
    options,
  };
}

/** Los estados terminales de una generación. */
export function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "REJECTED";
}

/**
 * Qué decir cuando termina mal.
 *
 * `REJECTED` y `FAILED` no son lo mismo y se arreglan distinto: uno es el
 * filtro —repetir da igual— y el otro puede ser el vídeo, la cara que no se
 * encuentra o un fallo suyo.
 */
export function lipsyncError(status: string, detail: string): string {
  const reason = detail.trim() || "sin motivo";

  if (status === "REJECTED") {
    return `Sync rechazó el vídeo: ${reason}. Repetirlo igual dará lo mismo.`;
  }

  return `Sync falló: ${reason}`;
}
