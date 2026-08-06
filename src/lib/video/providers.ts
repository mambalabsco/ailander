import "server-only";

import { createQueue } from "@/lib/queue";
import { explainProvider } from "@/lib/video/provider-errors";
import { buildLipsyncBody, isTerminal, lipsyncError, type LipsyncRequest } from "@/lib/video/lipsync";

import { createCache } from "@/lib/ttl-cache";
import { buildInput, VIDEO_GENERATORS } from "@/lib/video/catalog";
import {
  buildMusicInput,
  findMusicGenerator,
  readMusicUrl,
  type MusicGenerator,
} from "@/lib/video/music";
import { charactersToWords, spokenSeconds, type Alignment, type TimedWord } from "@/lib/video/words";
import { clampSettings, toApi, type VoiceSettings } from "@/lib/video/voice-settings";
import type { VocabularyEntry } from "@/lib/video/vocabulary";
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

/**
 * La cola por la que pasan **todas** las llamadas a proveedores.
 *
 * ## Por qué aquí y no en cada pantalla
 *
 * Porque cada pantalla se protegía sola y el proveedor no cuenta por pantalla:
 * cuenta por cuenta. Cuatro imágenes del adaptador, un flujo generando clips y
 * alguien en el estudio eran seis llamadas a la vez que nadie había pedido — y
 * cuando saltaba el cupo, cada pantalla lo descubría y reintentaba por su
 * cuenta, todas a la vez, que es lo que lo volvía a hacer saltar.
 *
 * Interceptando el `fetch` en vez de envolver cada función, no queda ninguna
 * llamada fuera: la que se añada mañana entra por el mismo sitio.
 */
const queue = createQueue({
  limit: Number(process.env.PROVIDER_CONCURRENCY) || undefined,
});

/**
 * A qué carril va cada llamada.
 *
 * Uno por proveedor y no uno global: fal y ElevenLabs son cuentas distintas con
 * cupos distintos, y compartir tope entre ellas sería frenar una porque la otra
 * va cargada.
 */
function laneFor(url: string): string {
  if (url.includes("fal.run") || url.includes("fal.ai")) return "fal";
  if (url.includes("elevenlabs.io")) return "eleven";
  if (url.includes("kie.ai")) return "kie";
  if (url.includes("sync.so")) return "sync";

  return "otros";
}

/** Lo que el proveedor pide esperar, cuando lo dice en la cabecera. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/**
 * El `fetch` de siempre, pero dentro de la cola.
 *
 * Solo se convierten en excepción los estados que **merece la pena reintentar**
 * —el cupo y los fallos del proveedor—. Un 400 sigue devolviendo su respuesta
 * tal cual, para que cada función lea su cuerpo y explique qué campo estaba mal:
 * reintentar eso cuatro veces solo retrasaría el mensaje cuarenta segundos.
 */
async function queued(url: string, init: RequestInit): Promise<Response> {
  return queue.run(laneFor(url), async () => {
    const response = await fetch(url, init);

    if (response.status === 429 || response.status >= 500) {
      const detail = await response.text().catch(() => "");

      throw Object.assign(
        new Error(`${response.status} ${detail.slice(0, 200)}`.trim()),
        { status: response.status, retryAfterMs: retryAfterMs(response) },
      );
    }

    return response;
  });
}

/** Qué hay en marcha y qué está esperando, para poder enseñarlo. */
export function providerQueueStats() {
  return queue.all();
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
  /** Cómo suena: estabilidad, parecido, estilo, velocidad. */
  settings?: Partial<VoiceSettings>;
}): Promise<VoiceResult> {
  const response = await queued(
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
        // Sin esto se generaba siempre con los valores por defecto, que suenan
        // más planos de lo que quiere un anuncio.
        voice_settings: toApi(clampSettings(options.settings ?? {})),
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
  /*
   * Las voces cambian cuando alguien clona una, o sea casi nunca.
   *
   * Y se piden en **cada carga** de las pantallas que las ofrecen. Una ida y
   * vuelta a ElevenLabs por navegación es medio segundo que se nota, y por un
   * dato que sigue siendo el mismo.
   */
  return voiceCache.get("voices", readVoices);
}

const voiceCache = createCache();

async function readVoices(): Promise<Voice[]> {
  const response = await queued("https://api.elevenlabs.io/v1/voices", {
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
  const response = await queued(`${KIE_BASE}${path}`, {
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
/**
 * Una dirección que el proveedor pueda descargar, volviéndola a firmar si hace
 * falta.
 *
 * ## El fallo que arregla
 *
 * Las firmadas de Supabase caducan a la hora. Mientras se mira una imagen en
 * pantalla eso da igual; en cuanto la dirección se **guarda** —en un nodo de
 * flujo, en un anuncio a medias— deja de servir sola. Un flujo montado ayer
 * lleva dentro la firma de ayer.
 *
 * Y no falla de forma visible: el proveedor no puede descargar la foto del
 * envase y genera sin ella. Sale una imagen convincente con un bote que no
 * existe, se anima, se monta, y se descubre viendo el vídeo terminado.
 *
 * Devuelve cadena vacía cuando no hay nada que hacer, y quien llama decide si
 * eso es parar o seguir sin referencia.
 */
async function usableReference(url: string): Promise<string> {
  if (await referenceIsReachable(url)) return url;

  const { storageRefFrom } = await import("@/lib/storage-url");
  const ref = storageRefFrom(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

  if (!ref) return "";

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");

    /*
     * Una hora, como el resto de la aplicación. Es de sobra para una
     * generación —las largas rondan los diez minutos— y no deja enlaces vivos
     * por ahí más de lo necesario.
     */
    const { data } = await createAdminClient()
      .storage.from(ref.bucket)
      .createSignedUrl(ref.path, 3600);

    return data?.signedUrl ?? "";
  } catch {
    return "";
  }
}

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
  /** La forma de la imagen. Vertical por defecto, que es la de un anuncio. */
  aspectRatio?: string;
  timeoutMs?: number;
}): Promise<string> {
  const wanted = options.references?.filter(Boolean) ?? [];

  const checked = await Promise.all(wanted.map((url) => usableReference(url)));

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
      aspect_ratio: options.aspectRatio || "9:16",
      ...(refs.length > 0 ? { image_urls: refs.slice(0, 10) } : {}),
    },
    options.timeoutMs ?? 4 * 60_000,
  );

  return urls[0];
}

/**
 * Genera un clip con cualquiera de los modelos del catálogo.
 *
 * Los campos los pone `buildInput`, que sabe cómo los llama cada familia. Antes
 * había aquí dos ramas escritas a mano, y con diez modelos eso deja de escalar:
 * mandar `image_urls` a uno que espera `image_url` **no da error**, devuelve un
 * clip generado sin la referencia.
 *
 * Sin `imageUrl` ni referencias parte solo del texto, y con un modelo de solo
 * texto las imágenes ni se mandan.
 */
export async function animate(options: {
  imageUrl?: string;
  /** Referencias extra. La primera imagen sigue siendo `imageUrl` si va. */
  references?: string[];
  prompt: string;
  seconds: number;
  /** El identificador que espera la API. Por defecto, el más barato. */
  model?: string;
  /** Que genere sonido él mismo. Solo lo miran los que saben. */
  sound?: boolean;
  /** La forma. Solo la miran los que la aceptan; el resto la heredan. */
  aspectRatio?: string;
  negativePrompt?: string;
  timeoutMs?: number;
}): Promise<string> {
  const slug = options.model || VIDEO_GENERATORS[0].slug;

  const generator =
    VIDEO_GENERATORS.find((entry) => entry.slug === slug) ??
    // Uno que no está en la tabla: se trata como el más común de todos.
    { ...VIDEO_GENERATORS[0], slug };

  /*
   * Las mismas comprobaciones que en las imágenes, y por el mismo motivo.
   *
   * Aquí faltaban: se mandaba lo que hubiera guardado, y una firma caducada
   * hacía que kie generase el clip **sin** la imagen de partida. El resultado
   * es un vídeo que no se parece a la toma anterior, y eso al mirarlo se
   * interpreta como que el modelo salió mal — no como que la referencia no
   * llegó.
   */
  const asked = [options.imageUrl ?? "", ...(options.references ?? [])].filter(Boolean);
  const references = (await Promise.all(asked.map((url) => usableReference(url)))).filter(Boolean);

  if (asked.length > 0 && references.length === 0) {
    throw new Error(
      `Ninguna de las ${asked.length} imágenes de partida se puede descargar desde fuera, así que ${generator.label} las ignoraría y el clip no se parecería a la toma anterior. Vuelve a elegirlas en el nodo.`,
    );
  }

  if (generator.mode !== "texto" && references.length === 0) {
    throw new Error(`${generator.label} necesita al menos una imagen de partida.`);
  }

  const input = buildInput(generator, {
    prompt: options.prompt,
    references,
    seconds: options.seconds,
    aspectRatio: options.aspectRatio || "9:16",
    sound: options.sound,
  });

  if (options.negativePrompt) input.negative_prompt = options.negativePrompt;

  const urls = await runTask(generator.slug, input, options.timeoutMs ?? 10 * 60_000);

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
  const response = await queued("https://fal.run/fal-ai/ffmpeg-api/compose", {
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
    throw falProblem("el montaje", response.status, detail);
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

  const response = await queued("https://api.elevenlabs.io/v1/speech-to-text", {
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

/**
 * Recorta un clip a los segundos que dura su frase.
 *
 * Es una llamada de montaje con **un solo plano dentro**, y ese es justo el
 * punto: encadenar varios en una misma pista es lo que no funcionaba — el
 * montador se quedaba con el último y lo repetía hasta que se acababa el audio,
 * con seis clips distintos y bien generados.
 *
 * Con uno solo no hay nada que encadenar ni orden que interpretar, así que el
 * resultado no depende de una semántica que no se puede comprobar sin ejecutarla.
 */
export async function trimClip(url: string, seconds: number): Promise<string> {
  const { videoUrl } = await compose([
    {
      id: "v",
      type: "video",
      keyframes: [{ timestamp: 0, duration: Math.max(100, Math.round(seconds * 1000)), url }],
    },
  ]);

  return videoUrl;
}

/**
 * El último fotograma de un vídeo.
 *
 * ## Para qué
 *
 * Para encadenar tramos. Un generador que solo hace quince segundos puede hacer
 * un anuncio de cincuenta si cada tramo **empieza donde acabó el anterior**: se
 * saca el último fotograma y se le manda como imagen de partida al siguiente.
 *
 * Sin eso, cuatro tramos de quince segundos son cuatro anuncios distintos
 * pegados: cambia el sitio, cambia la ropa y cambia la cara entre uno y otro. Y
 * eso no da error en ningún sitio — se ve al reproducirlo, con los cuatro ya
 * pagados.
 *
 * El parámetro se llama `frame_type` y vale `first`, `middle` o `last`. Por
 * defecto es `first`: mandarlo mal no falla, devuelve el fotograma equivocado y
 * el tramo siguiente arranca del principio del anterior.
 */
export async function lastFrame(videoUrl: string): Promise<string> {
  const response = await queued("https://fal.run/fal-ai/ffmpeg-api/extract-frame", {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ video_url: videoUrl, frame_type: "last" }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo sacar el último fotograma: ${response.status} ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { images?: { url?: string }[] };
  const url = data.images?.[0]?.url;

  if (!url) throw new Error("El extractor no devolvió ningún fotograma.");

  return url;
}

/**
 * Pega varios clips en uno, en orden.
 *
 * Aquí no hay tiempos que interpretar: es una lista y se unen uno detrás de
 * otro. Por eso se usa esto para el encadenado y el montaje solo para lo que sí
 * necesita capas —la voz, la música y los subtítulos encima.
 */
export async function mergeVideos(urls: string[]): Promise<string> {
  if (urls.length === 1) return urls[0];

  const response = await queued("https://fal.run/fal-ai/ffmpeg-api/merge-videos", {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_urls: urls,
      // La proporción sale del primero: todos vienen del mismo generador y del
      // mismo formato, y sin esto se toma el mínimo de todos, que puede recortar.
      resolution_aspect_ratio_video_index: 0,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("fal rechazó la clave. Comprueba FAL_KEY.");
    throw falProblem("el encadenado", response.status, detail);
  }

  const payload = (await response.json()) as { video?: { url?: string } };
  if (!payload.video?.url) throw new Error("El encadenado no devolvió ningún vídeo.");

  return payload.video.url;
}

/**
 * Quema los subtítulos en el vídeo, con estilo de anuncio vertical.
 *
 * **Transcribe él el vídeo ya montado, y por eso no se le manda ningún SRT.**
 *
 * Antes se le pasaba el texto con tiempos calculados aquí, a partir de cuándo
 * dijo cada palabra el generador de voz. Salía descuadrado, y tenía que salir:
 * esos tiempos describen el archivo de voz suelto, no el vídeo terminado. Entre
 * uno y otro hay clips que se recortan, un último plano que se estira hasta el
 * final del audio y una mezcla con música — cada paso mueve las cosas unas
 * décimas, y unas décimas se leen como que el subtítulo no va con la voz.
 *
 * Escuchando el archivo final no hay nada que estimar. La ortografía, que es lo
 * único que se perdía al transcribir, se arregla con `vocabulary`: se le dice
 * cómo se escribe lo que va a oír pronunciado de otra forma.
 *
 * Por eso este parámetro no existe aquí aunque la API lo acepte. Volver a
 * mandarlo devolvería el descuadre entero.
 */
export async function burnSubtitles(options: {
  videoUrl: string;
  preset: string;
  /** El idioma del audio, para que no lo adivine. */
  language?: string;
  /** Cómo se escribe lo que se pronuncia raro. */
  vocabulary?: VocabularyEntry[];
}): Promise<string> {
  const response = await queued("https://fal.run/veed/subtitles", {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_url: options.videoUrl,
      preset: options.preset,
      ...(options.language ? { language: options.language } : {}),
      ...(options.vocabulary?.length ? { vocabulary: options.vocabulary } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("fal rechazó la clave. Comprueba FAL_KEY.");
    throw new Error(`Los subtítulos respondieron ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { video?: { url?: string } };
  if (!payload.video?.url) throw new Error("No devolvió ningún vídeo con subtítulos.");

  return payload.video.url;
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
  /** Cuál de ellos. Por defecto, el barato. */
  model?: string;
  /** Qué intento es. Sin esto, el segundo devuelve la misma pieza que el primero. */
  take?: number;
}): Promise<{ url: string; model: MusicGenerator }> {
  const model = findMusicGenerator(options.model ?? "");

  const response = await queued(`https://fal.run/${model.slug}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildMusicInput(model, options)),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw falProblem(`la música con ${model.label}`, response.status, detail);
  }

  const url = readMusicUrl(model, await response.json());
  if (!url) throw new Error(`${model.label} no devolvió ninguna música.`);

  return { url, model };
}

/**
 * Deja un audio a un volumen perceptual concreto.
 *
 * ## Por qué esto y no multiplicar las muestras
 *
 * Antes la música se bajaba al 12 % escribiendo dentro del WAV. Funcionaba con
 * un WAV y solo con uno: los generadores nuevos devuelven MP3, y ahí el mismo
 * código no toca nada —devuelve el archivo igual— así que la cama entraría a
 * volumen de canción y taparía la locución.
 *
 * Y un porcentaje tampoco es lo que se quiere. Un 12 % de una pista suave y un
 * 12 % de una pista comprimida suenan a cosas distintas. Lo que hace que una
 * cama acompañe sin competir es su **sonoridad**, que se mide en LUFS y es
 * justo lo que ajusta esto.
 *
 * Da dos vueltas al archivo —mide y luego corrige— en vez de una. Tarda algo
 * más y es lo que hace que el resultado caiga donde se pidió.
 */
export async function normalizeLoudness(url: string, lufs: number): Promise<string> {
  const response = await queued("https://fal.run/fal-ai/ffmpeg-api/loudnorm", {
    method: "POST",
    headers: {
      Authorization: `Key ${key("FAL_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: url,
      integrated_loudness: Math.max(-70, Math.min(-5, lufs)),
      // Sin esto un pico suelto puede saturar aunque la media esté bien.
      true_peak: -1.5,
      linear: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw falProblem("el ajuste de volumen", response.status, detail);
  }

  const payload = (await response.json()) as { audio?: { url?: string } };
  if (!payload.audio?.url) throw new Error("El ajuste de volumen no devolvió ningún audio.");

  return payload.audio.url;
}

/**
 * Cuánto dura de verdad un archivo, preguntándoselo a quien lo va a montar.
 *
 * ## Por qué no basta con lo que se pidió
 *
 * Un clip de «seis segundos» rara vez dura seis: los generadores entregan 5,8 o
 * 6,2 según el modelo, y las duraciones del montaje se calculan sumando. Con
 * seis planos, medio segundo de error por plano son tres segundos de desfase
 * entre la imagen y la voz — que es exactamente lo que se lee como «no está
 * sincronizado».
 *
 * Y hay archivos de los que **no se sabe nada**: uno subido a mano, o el
 * resultado de un modelo que decide él la duración. Ahí no hay número que
 * suponer.
 *
 * Devuelve cero si no se puede leer, y quien llama decide: cero es «no lo sé»,
 * no «dura cero», y confundirlos deja un montaje de duración nula.
 */
export async function mediaSeconds(url: string): Promise<number> {
  try {
    const response = await queued("https://fal.run/fal-ai/ffmpeg-api/metadata", {
      method: "POST",
      headers: {
        Authorization: `Key ${key("FAL_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ media_url: url, extract_frames: false }),
      cache: "no-store",
    });

    if (!response.ok) return 0;

    const payload = (await response.json()) as { media?: { duration?: number } };
    const seconds = Number(payload.media?.duration);

    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  } catch {
    // Un fallo aquí no puede tumbar el montaje: quien llama se apaña con lo que
    // pidió, que es peor pero sirve.
    return 0;
  }
}

/* ------------------------------ Clonar una voz ----------------------------- */

/**
 * Crea una voz a partir de muestras de audio.
 *
 * Un minuto de audio limpio da mejor resultado que diez de audio con ruido: el
 * clonado copia lo que oye, incluido el eco de la habitación y el zumbido del
 * aire acondicionado. Se avisa donde se sube, que es cuando sirve.
 */
export async function cloneVoice(options: {
  name: string;
  description?: string;
  samples: { filename: string; bytes: Uint8Array; contentType: string }[];
}): Promise<{ voiceId: string }> {
  const form = new FormData();
  form.append("name", options.name);
  if (options.description) form.append("description", options.description);

  for (const sample of options.samples) {
    form.append(
      "files",
      new Blob([new Uint8Array(sample.bytes)], { type: sample.contentType }),
      sample.filename,
    );
  }

  const response = await queued("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": key("ELEVENLABS_API_KEY") },
    body: form,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    if (response.status === 401) {
      throw new Error("ElevenLabs rechazó la clave. Comprueba ELEVENLABS_API_KEY.");
    }

    /*
     * El clonado no está en todos los planes.
     *
     * El mensaje crudo dice «can_not_use_instant_voice_cloning», que no le dice
     * nada a nadie: quien lo lee se pone a revisar el archivo de audio.
     */
    if (/cloning|subscription|plan/i.test(detail)) {
      throw new Error(
        "Tu plan de ElevenLabs no incluye clonar voces. Hace falta uno de pago; con el gratuito solo se pueden usar las del catálogo.",
      );
    }

    throw new Error(`ElevenLabs respondió ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { voice_id?: string };
  if (!payload.voice_id) throw new Error("No devolvió ninguna voz.");

  /*
   * Se olvida la lista para que la voz nueva salga ya.
   *
   * Sin esto, quien acaba de clonar una voz no la ve en el desplegable hasta
   * dentro de cinco minutos y da por hecho que el clonado falló — que es
   * exactamente el momento en que una caché estorba.
   */
  voiceCache.forget("voices");

  return { voiceId: payload.voice_id };
}

/**
 * El error del proveedor, ya traducido y como excepción.
 *
 * La clasificación vive en `provider-errors.ts`, que es puro y está probado:
 * decide qué se le dice a alguien que acaba de perder una generación, y de eso
 * depende si lo arregla en un minuto o si mira el código equivocado.
 */
function falProblem(what: string, status: number, detail: string): Error {
  return new Error(explainProvider(what, status, detail).message);
}

/* --------------------------------- Lipsync --------------------------------- */

/**
 * La clave de Sync: primero la de Configuración, y si no la del entorno.
 *
 * Ese orden y no el contrario. La de Configuración la pone quien usa la
 * plataforma; la del entorno solo se puede poner entrando al servidor, así que
 * si mandara ella, cambiarla desde la pantalla no haría nada y no habría manera
 * de saber por qué.
 */
async function syncKey(): Promise<string> {
  const { readProviderConfig } = await import("@/lib/provider-config");
  const saved = (await readProviderConfig().catch(() => null))?.syncApiKey?.trim();

  if (saved) return saved;

  const fromEnv = process.env.SYNC_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "Falta la clave de Sync. Ponla en Configuración → Sync · lipsync y vuelve a ejecutar el nodo.",
  );
}

/**
 * Poner la locución aprobada en la boca del vídeo, con Sync.
 *
 * ## Por qué se sondea con `wait` y no con esperas a secas
 *
 * Porque su `GET` acepta mantener la petición abierta hasta diez segundos y
 * contestar en cuanto termina. Con esperas ciegas, un lipsync que tarda doce
 * segundos se entera a los quince; así se entera a los doce, y son seis planos
 * por anuncio.
 *
 * Los diez segundos son su tope: pedir más lo rechaza.
 *
 * ## Lo que no se hace aquí
 *
 * No se sube nada. Sync descarga las dos direcciones él mismo, así que tienen
 * que ser alcanzables desde fuera —lo mismo que ya hace falta para las
 * referencias de imagen—. Si una no lo es, contesta 422 y ese mensaje se pasa
 * tal cual: dice cuál de las dos falló, que es justo lo que hay que saber.
 */
export async function lipsync(
  request: LipsyncRequest & { timeoutMs?: number },
): Promise<{ url: string; seconds: number }> {
  const apiKey = await syncKey();
  const headers = { "x-api-key": apiKey, "content-type": "application/json" };

  const created = await queued("https://api.sync.so/v2/generate", {
    method: "POST",
    headers,
    body: JSON.stringify(buildLipsyncBody(request)),
  });

  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    throw new Error(`Sync no aceptó el trabajo (${created.status}): ${detail.slice(0, 300)}`);
  }

  const job = (await created.json()) as { id?: string };
  if (!job.id) throw new Error("Sync no devolvió identificador de trabajo.");

  const deadline = Date.now() + (request.timeoutMs ?? 15 * 60_000);
  const url = `https://api.sync.so/v2/generate/${encodeURIComponent(job.id)}?wait=10`;

  while (Date.now() < deadline) {
    const response = await queued(url, { method: "GET", headers });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Sync no dio el estado (${response.status}): ${detail.slice(0, 200)}`);
    }

    const state = (await response.json()) as {
      status?: string;
      outputUrl?: string;
      outputDuration?: number;
      error?: string;
      errorCode?: string;
    };

    const status = state.status ?? "";

    if (isTerminal(status)) {
      if (status !== "COMPLETED") {
        throw new Error(lipsyncError(status, state.error || state.errorCode || ""));
      }

      /*
       * Sin dirección no vale con dar el trabajo por bueno.
       *
       * Un `COMPLETED` con `outputUrl` vacío es el fallo silencioso de siempre:
       * el nodo se pinta en verde, el montaje coge una cadena vacía y el vídeo
       * final sale sin ese plano.
       */
      if (!state.outputUrl) throw new Error("Sync terminó sin devolver el vídeo.");

      return { url: state.outputUrl, seconds: state.outputDuration ?? 0 };
    }
  }

  throw new Error("Sync tardó demasiado. El trabajo puede seguir; vuelve a ejecutar ese nodo.");
}
