import "server-only";

import { charactersToWords, spokenSeconds, type Alignment, type TimedWord } from "@/lib/video/words";
import type { Track } from "@/lib/video/timeline";

/**
 * Los tres proveedores del pipeline de vídeo.
 *
 * Juntos y no en tres archivos porque comparten la forma —clave por variable de
 * entorno, sondeo asíncrono, traducción del error— y separarlos triplicaría esa
 * parte sin separar nada real.
 *
 * | Paso            | Proveedor  | Precio medido        |
 * |-----------------|------------|----------------------|
 * | Voz + tiempos   | ElevenLabs | por carácter         |
 * | Keyframe        | kie.ai     | ~$0,02 por imagen    |
 * | Vídeo i2v       | kie.ai     | ~$0,07 por segundo   |
 * | Montaje         | fal        | céntimos por vídeo   |
 *
 * Los endpoints y sus campos vienen de los documentos del pipeline —probados en
 * producción— salvo el de montaje, cuyo esquema se verificó contra su OpenAPI.
 *
 * **Nada de esto se ha ejecutado contra las APIs reales desde aquí.** La forma
 * está verificada; el comportamiento con credenciales de verdad, no.
 */

/* ------------------------------ Credenciales ------------------------------- */

function key(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Falta ${name} en el entorno del servidor. Añádela en .env.local y reinicia la plataforma.`,
    );
  }
  return value;
}

export function videoProvidersReady(): { voice: boolean; images: boolean; compose: boolean } {
  return {
    voice: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    images: Boolean(process.env.KIE_API_KEY?.trim()),
    compose: Boolean(process.env.FAL_KEY?.trim()),
  };
}

/* ---------------------------------- Voz ------------------------------------ */

export interface VoiceResult {
  /** El audio, para subirlo a almacenamiento. */
  audio: Buffer;
  words: TimedWord[];
  seconds: number;
}

/**
 * Genera la voz y devuelve **los tiempos de cada palabra**.
 *
 * El endpoint con marcas de tiempo cuesta lo mismo que el normal —se cobra por
 * carácter, no por variante— y es lo que hace innecesario transcribir después.
 * Transcribir con Whisper fue el camino anterior y suelta palabras de forma no
 * determinista, incluida la marca en la llamada a la acción; ninguna corrección
 * posterior puede **añadir** una palabra que falta.
 *
 * Se genera **toma por toma** y no el guion entero de una vez: con textos largos
 * el modelo rápido repite frases. Es un fallo conocido del proveedor, no de la
 * llamada.
 */
export async function speak(options: {
  text: string;
  voiceId: string;
  modelId?: string;
}): Promise<VoiceResult> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(options.voiceId)}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key("ELEVENLABS_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: options.text,
        model_id: options.modelId ?? "eleven_multilingual_v2",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("ElevenLabs rechazó la clave. Comprueba ELEVENLABS_API_KEY.");
    }
    if (response.status === 422) {
      throw new Error(
        `ElevenLabs rechazó la petición: seguramente el identificador de voz no existe. ${detail.slice(0, 200)}`,
      );
    }
    throw new Error(`ElevenLabs respondió ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    audio_base64?: string;
    alignment?: Alignment;
    normalized_alignment?: Alignment;
  };

  if (!payload.audio_base64) throw new Error("ElevenLabs no devolvió audio.");

  /*
   * Se prefiere `alignment` a `normalized_alignment`.
   *
   * El normalizado trae el texto después de expandir números y símbolos, así que
   * sus palabras no coinciden con las del guion y los cortes no encontrarían
   * nada. El sin normalizar conserva lo que se escribió, que es contra lo que se
   * compara.
   */
  const alignment = payload.alignment ?? payload.normalized_alignment;
  const words = alignment ? charactersToWords(alignment) : [];

  return {
    audio: Buffer.from(payload.audio_base64, "base64"),
    words,
    seconds: spokenSeconds(words),
  };
}

export interface Voice {
  id: string;
  name: string;
  /** Cómo suena, según las etiquetas del proveedor: acento, edad, uso. */
  labels: string[];
  /** Muestra de audio, para poder oírla antes de elegir. */
  previewUrl?: string;
}

/**
 * Las voces de la cuenta.
 *
 * Se leen del proveedor en vez de pedir que alguien pegue identificadores. Un
 * identificador de voz copiado a mano es un campo más donde equivocarse, y el
 * error no se ve hasta oír el resultado — con la generación ya pagada.
 */
export async function listVoices(): Promise<Voice[]> {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key("ELEVENLABS_API_KEY") },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("ElevenLabs rechazó la clave. Comprueba ELEVENLABS_API_KEY.");
    }
    throw new Error(`ElevenLabs respondió ${response.status} al listar las voces.`);
  }

  const payload = (await response.json()) as {
    voices?: { voice_id: string; name?: string; labels?: Record<string, string>; preview_url?: string }[];
  };

  return (payload.voices ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.name ?? voice.voice_id,
    labels: Object.values(voice.labels ?? {}).filter(Boolean),
    previewUrl: voice.preview_url,
  }));
}

/* --------------------------------- kie.ai ---------------------------------- */

const KIE_BASE = "https://api.kie.ai/api/v1";

interface KieTask {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: string;
    failMsg?: string;
    failCode?: string;
  };
}

async function kie<T extends KieTask>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${KIE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key("KIE_API_KEY")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T;

  if (!response.ok || (payload.code !== undefined && payload.code !== 200)) {
    throw new Error(`kie.ai: ${payload.msg ?? `respondió ${response.status}`}`);
  }

  return payload;
}

/**
 * Lanza una tarea y espera a que termine.
 *
 * El sondeo sube el intervalo poco a poco: un keyframe tarda unos segundos y un
 * clip de vídeo varios minutos, así que preguntar cada segundo durante cuatro
 * minutos solo gasta cupo. El tope existe porque una tarea encallada bloquearía
 * el trabajo de fondo para siempre.
 */
async function runTask(
  model: string,
  input: Record<string, unknown>,
  timeoutMs: number,
): Promise<string[]> {
  const created = await kie("/jobs/createTask", {
    method: "POST",
    body: JSON.stringify({ model, input }),
  });

  const taskId = created.data?.taskId;
  if (!taskId) throw new Error("kie.ai no devolvió identificador de tarea.");

  const deadline = Date.now() + timeoutMs;
  let wait = 3_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = Math.min(wait * 1.3, 15_000);

    const status = await kie(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      method: "GET",
    });

    const state = status.data?.state;

    if (state === "fail") {
      /*
       * Un fallo de moderación no se reintenta.
       *
       * Es la distinción que ahorra tiempo y créditos: un `fetch failed` o un
       * 500 son de red y se resuelven repitiendo, pero si el contenido no pasa
       * el filtro, repetir el mismo prompt falla igual. Quien llama necesita
       * saber cuál de los dos es.
       */
      const reason = status.data?.failMsg ?? "sin motivo";
      throw new Error(
        status.data?.failCode
          ? `Rechazado por el filtro de contenido (${status.data.failCode}): ${reason}. Cambia el prompt antes de reintentar.`
          : `kie.ai falló: ${reason}`,
      );
    }

    if (state === "success") {
      /*
       * `resultJson` viene como **cadena**, no como objeto. Tratarlo como objeto
       * devuelve `undefined` sin dar error y la tarea parece haber salido vacía.
       */
      const raw = status.data?.resultJson;
      if (!raw) throw new Error("kie.ai terminó sin resultado.");

      const parsed = JSON.parse(raw) as { resultUrls?: string[] };
      const urls = parsed.resultUrls ?? [];
      if (urls.length === 0) throw new Error("kie.ai terminó sin ninguna URL.");

      return urls;
    }
  }

  throw new Error(
    `La tarea de kie.ai no terminó en ${Math.round(timeoutMs / 60_000)} minutos. Puede haber salido bien igualmente: revisa antes de volver a lanzarla.`,
  );
}

/**
 * Un keyframe: la imagen fija de la que sale la toma.
 *
 * Con referencias cambia de modelo. Las referencias son lo que mantiene al mismo
 * personaje entre tomas y lo que hace que el envase sea el real, y sin ellas
 * cada imagen inventa una cara distinta.
 */
/**
 * Comprueba que una referencia se puede descargar **desde fuera**.
 *
 * Es la comprobación que faltaba y por la que se podía estar generando el envase
 * equivocado sin enterarse: el generador descarga la imagen por su cuenta desde
 * sus servidores, y si no puede —una dirección firmada caducada, un bucket
 * privado, un archivo movido— **no da error**: genera sin ella y devuelve una
 * imagen preciosa con un frasco inventado.
 *
 * Un fallo que devuelve algo bonito es el peor tipo de fallo, porque nadie lo
 * busca. Se pide solo la cabecera, que cuesta un parpadeo.
 */
async function referenceIsReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.ok) return true;

    // Hay almacenamientos que no aceptan HEAD; se reintenta pidiendo un trozo.
    const partial = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });

    return partial.ok;
  } catch {
    return false;
  }
}

export async function keyframe(options: {
  prompt: string;
  references?: string[];
  timeoutMs?: number;
}): Promise<string> {
  const wanted = options.references?.filter(Boolean) ?? [];

  const checked = await Promise.all(
    wanted.map(async (url) => ((await referenceIsReachable(url)) ? url : "")),
  );

  const refs = checked.filter(Boolean);

  /*
   * Si se pidió referencia y ninguna sirve, se para.
   *
   * Generar igualmente sale más caro de lo que parece: la imagen queda
   * convincente con un envase que no existe, se anima, se monta, y el fallo se
   * descubre al mirar el vídeo terminado.
   */
  if (wanted.length > 0 && refs.length === 0) {
    throw new Error(
      "La foto de referencia no se puede descargar desde fuera, así que el envase saldría inventado. Comprueba que el producto tiene imagen principal y vuelve a intentarlo.",
    );
  }

  const urls = await runTask(
    refs.length > 0 ? "google/nano-banana-edit" : "google/nano-banana",
    {
      prompt: options.prompt,
      output_format: "png",
      // `aspect_ratio` y no `image_size`: el segundo está marcado como sustituido
      // en la API, y un parámetro obsoleto acaba ignorándose sin avisar.
      aspect_ratio: "9:16",
      ...(refs.length > 0 ? { image_urls: refs.slice(0, 10) } : {}),
    },
    options.timeoutMs ?? 4 * 60_000,
  );

  return urls[0];
}

/**
 * Anima un keyframe.
 *
 * `multi_shots` es obligatorio aunque no se use: si falta, la API responde 422
 * con «multi_shots cannot be empty». Va explícito por eso.
 *
 * El modo estándar da 720p, que es exactamente el formato del entregable
 * (720×1280). El modo alto cuesta el doble para una resolución que después se
 * reescala hacia abajo.
 */
export async function animate(options: {
  imageUrl: string;
  prompt: string;
  seconds: number;
  /** El modelo del proveedor. Por defecto, el de mejor imagen. */
  model?: string;
  negativePrompt?: string;
  timeoutMs?: number;
}): Promise<string> {
  const model = options.model || "kling-3.0/video";

  /*
   * Cada modelo tiene sus campos y no se parecen.
   *
   * Grok no entiende `mode: "std"` ni `multi_shots`, y su resolución por defecto
   * es 480p: si no se pide 720p, el vídeo sale a la mitad de tamaño que los
   * keyframes y se nota en el montaje. Mandar los campos del otro no da error
   * claro — se ignoran y el resultado sale distinto de lo esperado.
   */
  const input = model.startsWith("grok-imagine")
    ? {
        prompt: options.prompt,
        image_urls: [options.imageUrl],
        // De 6 a 30, paso de uno, y como cadena: así lo pide la API.
        duration: String(Math.min(30, Math.max(6, Math.round(options.seconds)))),
        resolution: "720p",
        aspect_ratio: "9:16",
        mode: "normal",
      }
    : {
        prompt: options.prompt,
        image_urls: [options.imageUrl],
        duration: String(options.seconds),
        aspect_ratio: "9:16",
        mode: "std",
        // La voz va aparte y se pega en el montaje.
        sound: false,
        // Obligatorio en Kling: si falta, responde 422.
        multi_shots: false,
        ...(options.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
      };

  const urls = await runTask(model, input, options.timeoutMs ?? 10 * 60_000);

  return urls[0];
}

/* --------------------------------- Montaje --------------------------------- */

/**
 * Monta el vídeo a partir de la línea de tiempo.
 *
 * Se hace fuera porque el servidor tiene dos núcleos y el quemado final tarda
 * unos cincuenta segundos por minuto de vídeo **en dieciséis**. Aquí la
 * plataforma solo espera, que es lo que ya hace con el resto de generaciones.
 */
export async function compose(tracks: Track[]): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  const response = await fetch("https://fal.run/fal-ai/ffmpeg-api/compose", {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tracks }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("fal rechazó la clave. Comprueba FAL_KEY.");
    throw new Error(`El montaje respondió ${response.status}. ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { video_url?: string; thumbnail_url?: string };
  if (!payload.video_url) throw new Error("El montaje no devolvió ningún vídeo.");

  return { videoUrl: payload.video_url, thumbnailUrl: payload.thumbnail_url ?? "" };
}

/* ------------------------------ Transcribir -------------------------------- */

/**
 * El audio de un vídeo, pasado a texto.
 *
 * Se usa **solo para analizar anuncios ajenos**, no para el pipeline propio: ahí
 * la voz se genera con sus tiempos de palabra y transcribir sería dar una vuelta
 * para acabar con menos precisión de la que ya se tiene.
 *
 * Devuelve cadena vacía en vez de fallar cuando no hay voz o no se entiende. Un
 * anuncio de solo texto en pantalla es un formato normal, y quedarse sin análisis
 * por eso sería absurdo: los fotogramas siguen contando la mitad de la historia.
 */
export async function transcribe(audio: Buffer, languageCode?: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model_id", "scribe_v1");
  if (languageCode) form.append("language_code", languageCode);

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key("ELEVENLABS_API_KEY") },
    body: form,
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("ElevenLabs rechazó la clave. Comprueba ELEVENLABS_API_KEY.");
    }

    // Los demás fallos no tumban el análisis: se sigue con lo visual.
    return "";
  }

  const data = (await response.json()) as { text?: string };
  return typeof data.text === "string" ? data.text.trim() : "";
}

/* --------------------------------- Música ---------------------------------- */

/**
 * Genera una cama musical a medida.
 *
 * Se pide en fal y no en kie porque el generador de música vive ahí. Devuelve un
 * WAV, que es justo el formato al que se le puede bajar el volumen sin
 * decodificar nada — y bajárselo es obligatorio, porque el montaje mezcla sin
 * control de volumen y una pista a nivel de canción tapa la voz.
 */
export async function makeMusic(options: {
  prompt: string;
  seconds: number;
}): Promise<{ url: string }> {
  const response = await fetch("https://fal.run/cassetteai/music-generator", {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: options.prompt,
      // El generador acepta de diez a ciento ochenta segundos.
      duration: Math.max(10, Math.min(180, Math.round(options.seconds))),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("fal rechazó la clave. Comprueba FAL_KEY.");
    throw new Error(`La música respondió ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { audio_file?: { url?: string } };
  if (!payload.audio_file?.url) throw new Error("El generador no devolvió ninguna música.");

  return { url: payload.audio_file.url };
}
