import "server-only";

import { readProviderConfig } from "@/lib/provider-config";

/**
 * Cliente de Higgsfield.
 *
 * **Todo lo que hay aquí está verificado contra la API real**, no deducido de
 * la documentación —que está incompleta— ni de lo que parecía razonable. Lo
 * comprobado, sondeando la cuenta:
 *
 * - Autenticación: `Authorization: Key <id>:<secreto>`.
 * - `GET /models` devuelve el catálogo con `slug`, `operation_type`,
 *   `output_type` y `base_credits`. Es la fuente de qué modelos hay: no hay que
 *   escribir rutas a mano.
 * - `POST /{slug}` con `{ prompt, ... }` responde
 *   `{ status: "queued", request_id, status_url, cancel_url }`.
 * - `GET {status_url}` sondea. Estados: `queued`, `in_progress`, `completed`,
 *   `failed`, `nsfw`.
 * - Completado añade `images: [{ url }]`.
 * - Un `slug` inexistente da 404 `model_not_found`; uno sin acceso, 423
 *   `model_blocked`; y hay un tope de **4 peticiones simultáneas** (400).
 *
 * **La trampa que hay que conocer: la API ignora los campos que no reconoce en
 * lugar de rechazarlos.** Mandar `input_images` a un modelo que no lo entiende
 * no da error: encola la generación, cobra los créditos y devuelve una imagen
 * hecha sin la referencia. Por eso aquí solo se envían campos comprobados, y
 * por eso la imagen de producto como referencia **no está implementada**: el
 * nombre del parámetro no aparece en la documentación y no se puede descubrir
 * sondeando, porque la API no se queja. Adivinarlo produciría imágenes que
 * parecen correctas y no usan el producto.
 */

const BASE = "https://platform.higgsfield.ai";

export interface HiggsfieldModel {
  slug: string;
  title: string;
  operationType: string;
  outputType: string;
  /** Coste en créditos de una generación con este modelo. */
  baseCredits: number;
}

export interface HiggsfieldResult {
  status: "completed" | "failed" | "nsfw" | "queued" | "in_progress";
  requestId: string;
  imageUrls: string[];
  error?: string;
}

async function authHeader(): Promise<string> {
  const config = await readProviderConfig();

  if (!config.higgsfieldKeyId || !config.higgsfieldKeySecret) {
    throw new Error(
      "Faltan las credenciales de Higgsfield. Añádelas en Configuración: son un par id + secreto.",
    );
  }

  return `Key ${config.higgsfieldKeyId}:${config.higgsfieldKeySecret}`;
}

/**
 * El catálogo de modelos de la cuenta.
 *
 * Se consulta en vez de mantener una lista escrita: los modelos disponibles
 * dependen del plan, y una lista a mano se queda vieja sin avisar. Aquí se vio
 * que **Nano Banana Pro no está** en esta cuenta aunque aparezca en la web de
 * Higgsfield, así que ofrecer esa opción habría sido ofrecer un 404.
 */
export async function listImageModels(): Promise<HiggsfieldModel[]> {
  const response = await fetch(`${BASE}/models`, {
    headers: { Authorization: await authHeader(), Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Higgsfield respondió ${response.status} al pedir los modelos.`);
  }

  const payload = (await response.json()) as {
    items?: {
      slug: string;
      title?: string;
      operation_type?: string;
      output_type?: string;
      base_credits?: string;
    }[];
  };

  /*
   * Filtro deliberadamente ancho: **cualquier modelo que produzca imágenes**.
   *
   * La tentación era exigir `operation_type === "text2image"`, y sería un error:
   * los modelos que aceptan una imagen de referencia —Nano Banana Pro entre
   * ellos— no son text2image. Si Higgsfield habilita uno en la cuenta, tiene que
   * aparecer solo en el selector, sin tocar código.
   *
   * Se excluye `character`, que no genera imágenes: entrena un Soul ID.
   */
  return (payload.items ?? [])
    .filter((item) => item.output_type === "image" && item.operation_type !== "character")
    .map((item) => ({
      slug: item.slug,
      title: item.title || item.slug,
      operationType: item.operation_type ?? "",
      outputType: item.output_type ?? "",
      baseCredits: Number(item.base_credits ?? 0),
    }))
    .sort((a, b) => a.baseCredits - b.baseCredits);
}

/**
 * Genera una imagen y espera el resultado.
 *
 * Sondea hasta que el estado deja de ser transitorio. El intervalo empieza
 * corto y crece: una generación tarda entre veinte segundos y dos minutos, y
 * preguntar cada segundo durante dos minutos solo añade ruido.
 */
export async function generateImage(options: {
  modelSlug: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  /** Cuánto esperar como mucho, en milisegundos. */
  timeoutMs?: number;
}): Promise<HiggsfieldResult> {
  const auth = await authHeader();

  const response = await fetch(`${BASE}/${options.modelSlug}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    // Solo campos comprobados. Añadir otros «por si acaso» es peligroso: la API
    // los ignora en silencio y aun así cobra.
    body: JSON.stringify({
      prompt: options.prompt,
      ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {}),
    }),
  });

  const queued = (await response.json().catch(() => ({}))) as {
    status?: string;
    request_id?: string;
    status_url?: string;
    detail?: unknown;
  };

  if (!response.ok) {
    const detail = typeof queued.detail === "string" ? queued.detail : "";

    if (response.status === 404) {
      throw new Error(`Higgsfield no reconoce el modelo «${options.modelSlug}».`);
    }
    if (response.status === 423) {
      throw new Error(`Tu cuenta no tiene acceso al modelo «${options.modelSlug}».`);
    }
    if (response.status === 400 && detail.includes("concurrent")) {
      throw new Error(
        "Higgsfield admite 4 generaciones a la vez. Espera a que terminen las que hay en curso.",
      );
    }
    throw new Error(`Higgsfield respondió ${response.status}${detail ? `: ${detail}` : ""}.`);
  }

  const requestId = queued.request_id ?? "";
  const statusUrl = queued.status_url ?? `${BASE}/requests/${requestId}/status`;

  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60 * 1000);
  let wait = 3_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    // Hasta 15 segundos entre sondeos: la mayoría tarda más de un minuto.
    wait = Math.min(wait * 1.4, 15_000);

    const poll = await fetch(statusUrl, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });

    if (!poll.ok) continue;

    const state = (await poll.json()) as {
      status?: string;
      images?: { url?: string }[];
    };

    if (state.status === "completed") {
      return {
        status: "completed",
        requestId,
        imageUrls: (state.images ?? []).map((image) => image.url ?? "").filter(Boolean),
      };
    }

    if (state.status === "failed" || state.status === "nsfw") {
      return {
        status: state.status,
        requestId,
        imageUrls: [],
        error:
          state.status === "nsfw"
            ? "La generación se bloqueó por moderación. Los créditos se devuelven."
            : "La generación falló. Los créditos se devuelven.",
      };
    }
  }

  return {
    status: "in_progress",
    requestId,
    imageUrls: [],
    error:
      "La generación sigue en curso pasado el tiempo de espera. No se ha perdido: vuelve a mirar en un momento.",
  };
}
