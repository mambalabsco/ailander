/**
 * Sacar los fotogramas y el audio **en el navegador**, sin ffmpeg.
 *
 * ## Por qué aquí y no en el servidor
 *
 * El navegador ya sabe decodificar vídeo: es lo que hace cada vez que reproduce
 * uno. Aprovecharlo quita tres problemas de golpe.
 *
 * **El vídeo no se sube.** Solo viajan veinte JPEG y un audio pequeño: unos
 * cuatro megas en vez de sesenta. Con una conexión de casa es la diferencia
 * entre esperar unos segundos y esperar varios minutos.
 *
 * **El servidor no necesita ffmpeg.** Nada que instalar, nada que se pueda
 * romper en un despliegue, y ningún proceso comiéndose los dos núcleos mientras
 * alguien más usa la plataforma.
 *
 * **Y no cuesta nada.** La alternativa era la API de fal, que para esto solo
 * ofrece el primer fotograma, el del medio y el último — tres no bastan para
 * leer un gancho, y sacar veinte serían cuarenta llamadas encadenadas.
 *
 * ## Lo que hay que aceptar a cambio
 *
 * Depende del códec que sepa leer ese navegador. Un mp4 con H.264 lo abre
 * cualquiera; un contenedor raro puede fallar, y entonces se dice claramente en
 * vez de dejar el análisis a medias sin explicación.
 */

/** El ancho al que se guardan los fotogramas: es el que mira Claude. */
const FRAME_WIDTH = 768;

/** Cuántas veces por segundo se muestrea el audio para transcribir. */
const AUDIO_RATE = 16_000;

export interface BrowserProbe {
  duration: number;
  width: number;
  height: number;
}

function load(file: File): { video: HTMLVideoElement; release: () => void } {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");

  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  return { video, release: () => URL.revokeObjectURL(url) };
}

function onceReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve();

    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () =>
        reject(
          new Error(
            "Tu navegador no puede leer este vídeo. Prueba a convertirlo a mp4 (H.264) y vuelve a subirlo.",
          ),
        ),
      { once: true },
    );
  });
}

/** Cuánto dura y de qué tamaño es, sin subir nada. */
export async function probeInBrowser(file: File): Promise<BrowserProbe> {
  const { video, release } = load(file);

  try {
    await onceReady(video);

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("No se pudo leer la duración de ese archivo. ¿Seguro que es un vídeo?");
    }

    return { duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    release();
  }
}

/**
 * Un JPEG por cada segundo pedido.
 *
 * Se busca y se espera al evento `seeked` antes de dibujar. Sin esa espera se
 * dibuja el fotograma **anterior**: el vídeo tarda en llegar al punto, y el
 * resultado son veinte imágenes casi iguales del principio, que además no se
 * nota hasta que el análisis sale raro.
 */
export async function grabFrames(
  file: File,
  marks: number[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  const { video, release } = load(file);

  try {
    await onceReady(video);

    const scale = video.videoWidth > 0 ? FRAME_WIDTH / video.videoWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale) || FRAME_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale) || Math.round(FRAME_WIDTH * 1.78);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el lienzo para los fotogramas.");

    const frames: Blob[] = [];

    for (const [index, mark] of marks.entries()) {
      const reached = new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
      });

      video.currentTime = mark;
      await reached;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );

      /*
       * Un fotograma que no sale no tumba el análisis.
       *
       * Pasa cerca del final y en vídeos con el índice roto. Con diecinueve se
       * entiende igual el anuncio; sin análisis, no se entiende nada.
       */
      if (blob) frames.push(blob);

      onProgress?.(index + 1, marks.length);
    }

    if (frames.length === 0) {
      throw new Error("No se pudo sacar ningún fotograma de ese vídeo.");
    }

    return frames;
  } finally {
    release();
  }
}

/* --------------------------------- El audio -------------------------------- */

/**
 * La pista de voz, en un WAV mono de 16 kHz.
 *
 * `decodeAudioData` devuelve la señal ya decodificada del contenedor, así que no
 * hace falta ffmpeg tampoco aquí. Se remuestrea a 16 kHz y se pasa a mono: es
 * voz, no música, y la transcripción no mejora con más — un minuto queda en algo
 * menos de dos megas.
 *
 * Devuelve `null` en vez de fallar cuando no hay pista de audio o el navegador
 * no sabe decodificarla. Un anuncio de solo texto en pantalla es un formato
 * normal, y los fotogramas siguen contando la otra mitad.
 */
export async function grabAudio(file: File): Promise<Blob | null> {
  try {
    const buffer = await file.arrayBuffer();

    // El contexto se crea al ritmo de salida para que el remuestreo lo haga el
    // navegador, que lo hace mejor que un bucle a mano.
    const Ctx = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
    if (!Ctx) return null;

    const probe = new (window.AudioContext ?? window.webkitAudioContext)();
    const decoded = await probe.decodeAudioData(buffer.slice(0));
    await probe.close();

    const frames = Math.ceil(decoded.duration * AUDIO_RATE);
    if (frames <= 0) return null;

    const offline = new Ctx(1, frames, AUDIO_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();

    return wav(rendered.getChannelData(0), AUDIO_RATE);
  } catch {
    return null;
  }
}

/** Empaqueta la señal como WAV de 16 bits, que es lo que se puede subir. */
function wav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    // Se recorta antes de escalar: un pico por encima de uno daría la vuelta al
    // entero y sonaría como un chasquido justo donde más alto habla la voz.
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}
