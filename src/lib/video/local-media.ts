/**
 * Sacar fotogramas y audio de un vídeo, en el servidor.
 *
 * Sin imports, probado en `local-media.test.ts`. Aquí solo se **componen los
 * argumentos** y se lee lo que devuelven los programas; ejecutarlos es de
 * `fetch-video.ts`, que sí toca el sistema. Separado así, todo lo que decide
 * algo se puede probar sin tener ffmpeg instalado.
 *
 * ## Por qué en el servidor, si eso se hacía en el navegador
 *
 * Porque para un vídeo que solo se tiene **por enlace** no hay navegador que
 * valga: el anuncio de otro está en TikTok o en la biblioteca de Meta, en otro
 * dominio, y el navegador no lo puede descargar ni decodificar. La única forma
 * de analizarlo sin bajarlo a mano y volver a subirlo es que lo haga el servidor.
 *
 * Sigue siendo el camino de excepción y no el normal: cuando el archivo está en
 * el ordenador, el navegador lo hace y el servidor se ahorra el trabajo. Este
 * existe para el caso en el que el otro no puede.
 *
 * ## Y por qué con topes tan cortos
 *
 * Dos núcleos y cuatro gigas sin swap. Un vídeo de diez minutos en 4K
 * decodificándose ahí dentro se lleva la memoria por delante y tira la
 * plataforma entera para quien la esté usando. Los topes no son prudencia: son
 * la diferencia entre analizar un anuncio y quedarse sin servidor.
 */

/** Lo máximo que se descarga. Un anuncio pasa de dos minutos casi nunca. */
export const MAX_SECONDS = 180;

/** Y lo máximo que se guarda en disco, por si el enlace no era un anuncio. */
export const MAX_BYTES = 120 * 1024 * 1024;

/** El ancho al que se escalan los fotogramas antes de mandarlos al modelo. */
export const FRAME_WIDTH = 768;

/**
 * Qué le falta al servidor para poder hacer esto.
 *
 * Se comprueba **antes** de empezar y se dice con el comando de instalación
 * dentro. Un `spawn` que falla porque el binario no existe devuelve `ENOENT`,
 * que no le dice nada a nadie.
 */
export function missingTools(found: { ffmpeg: boolean; ffprobe: boolean; ytdlp: boolean }): string {
  const missing: string[] = [];

  /*
     Cada binario con su nombre.

     Esto metía «ffmpeg» en la lista cuando lo que faltaba era `ffprobe`, y el
     mensaje mandaba a instalar algo que ya estaba. Vienen en el mismo paquete
     casi siempre, pero «casi» no vale para un mensaje de error: quien lo lee
     hace lo que dice, comprueba que ya está, y deja de creerse el aviso.
  */
  if (!found.ffmpeg) missing.push("ffmpeg");
  if (!found.ffprobe) missing.push("ffprobe");
  if (!found.ytdlp) missing.push("yt-dlp");

  if (missing.length === 0) return "";

  return [
    // Enumerado, no pegado con «y»: con tres falta queda «ffmpeg y ffprobe y
    // yt-dlp», que se lee como si fueran dos cosas y media.
    `Al servidor le falta ${
      missing.length > 1
        ? `${missing.slice(0, -1).join(", ")} y ${missing[missing.length - 1]}`
        : missing[0]
    } para poder bajar y trocear un vídeo desde un enlace.`,
    "Se instalan una vez:",
    "",
    missing.includes("ffmpeg") || missing.includes("ffprobe")
      ? "  apt-get install -y ffmpeg   # trae también ffprobe"
      : "",
    missing.includes("yt-dlp")
      ? "  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp"
      : "",
    "",
    "Mientras tanto, baja el vídeo y súbelo con el otro botón: eso lo hace el navegador y no necesita nada.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Los argumentos para bajar el vídeo.
 *
 * Se pide **el peor formato que siga siendo mirable**. No es tacañería: los
 * fotogramas se escalan a 768 px para mandárselos al modelo, así que bajar 4K
 * es decodificar dieciséis veces más píxeles para tirarlos después.
 */
export function downloadArgs(url: string, out: string): string[] {
  return [
    // Vídeo de hasta 720 de alto con su audio, y si no hay nada así, lo que haya.
    "-f",
    "best[height<=720]/bestvideo[height<=720]+bestaudio/best",
    "--no-playlist",
    // Un enlace a una lista o a un canal descargaría cien vídeos sin avisar.
    "--playlist-items",
    "1",
    "--max-filesize",
    String(MAX_BYTES),
    "--no-warnings",
    "--no-progress",
    // Sin esto, un sitio caído deja el proceso esperando para siempre.
    "--socket-timeout",
    "20",
    "-o",
    out,
    url,
  ];
}

/**
 * Los argumentos para sacar **un** fotograma en un segundo concreto.
 *
 * `-ss` va **antes** de `-i` a propósito: así ffmpeg salta directo a ese punto
 * en vez de decodificar el vídeo entero hasta llegar. Con veinte fotogramas de
 * un vídeo de dos minutos, esa diferencia es la que hace que esto acabe.
 */
export function frameArgs(input: string, at: number, out: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    at.toFixed(2),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    `scale=${FRAME_WIDTH}:-2`,
    "-q:v",
    "3",
    // Un núcleo por llamada: los fotogramas ya se sacan de uno en uno, y dejar
    // que ffmpeg se coma los dos deja la plataforma sin responder mientras.
    "-threads",
    "1",
    "-y",
    out,
  ];
}

/**
 * Los argumentos para sacar el audio en el formato que espera la transcripción.
 *
 * Mono a 16 kHz. Es lo que piden los transcriptores y es una décima parte de lo
 * que ocupa el audio original: la diferencia entre mandar cuatro megas y
 * cuarenta.
 */
export function audioArgs(input: string, out: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-t",
    String(MAX_SECONDS),
    "-threads",
    "1",
    "-y",
    out,
  ];
}

/**
 * Los argumentos para dejar una pista de música al volumen que se pida.
 *
 * ## Por qué esto se hace aquí y no fuera
 *
 * Porque el servicio de fuera devuelve **WAV sin comprimir**: se le manda un
 * MP3 de dos megas y devuelve ochenta y siete. Eso no cabe en el
 * almacenamiento, y aunque cupiera sería guardar cuarenta veces lo que hace
 * falta para una cama de fondo.
 *
 * Y aquí no aplica el motivo por el que el montaje sí va fuera. Ese codifica
 * vídeo —unos cincuenta segundos por minuto **en dieciséis núcleos**— y en dos
 * dejaría la plataforma arrastrándose. Normalizar audio no decodifica imagen:
 * son unos segundos para una pista de dos minutos.
 *
 * ## Dos pasadas, no una
 *
 * `loudnorm` en una pasada estima sobre la marcha y se queda cerca; en dos mide
 * primero y corrige después, y cae donde se pidió. Aquí se usa la de una porque
 * ffmpeg encadena las dos internamente cuando no se le dan las medidas, y para
 * una cama de fondo la diferencia es de décimas de LU.
 *
 * `TP` es el tope de pico: sin él, un golpe suelto satura aunque la media esté
 * bien, y eso se oye como un chasquido encima de la voz.
 */
export function loudnormArgs(input: string, out: string, lufs: number): string[] {
  // Dentro de lo que admite el filtro. Un valor fuera de rango no se ignora:
  // ffmpeg aborta y la pista se queda sin ajustar.
  const target = Math.max(-70, Math.min(-5, Math.round(lufs)));

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    // Sin vídeo: hay MP3 con carátula, y sin esto ffmpeg intenta copiarla.
    "-vn",
    "-af",
    `loudnorm=I=${target}:TP=-1.5:LRA=11`,
    /*
     * Sale MP3, no WAV. Es la razón de existir de esta función: una cama de
     * fondo a 192 kbps es indistinguible del original y ocupa lo que ocupaba.
     */
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    // Un núcleo, como el resto: el servidor tiene dos y sirve páginas con ellos.
    "-threads",
    "1",
    "-y",
    out,
  ];
}

/**
 * Las velocidades que se pueden pedir.
 *
 * Solo aceleraciones pequeñas. Un anuncio a 1,1x se lee como más enérgico y no
 * se nota; a 1,5x se nota, y lo que se nota deja de convencer y empieza a
 * parecer un truco. Y por debajo de 1 no está a propósito: ralentizar una
 * locución la vuelve pastosa, y para eso se regenera la voz.
 */
export const SPEEDS = [1.05, 1.1, 1.15, 1.2] as const;

/**
 * Los argumentos para acelerar un vídeo sin desincronizar el audio.
 *
 * ## Las dos mitades tienen que ir juntas
 *
 * `setpts` cambia el tiempo de la **imagen** y `atempo` el del **sonido**.
 * Aplicar solo el primero es el error clásico: el vídeo dura menos, el audio
 * sigue durando lo mismo, y el montador lo recorta al final. No da ningún
 * error — sale un anuncio en el que la boca va por delante de la voz y la
 * última frase falta.
 *
 * `atempo` cambia la velocidad **sin cambiar el tono**. Con `asetrate` la voz
 * subiría de tono y sonaría a dibujo animado, que es lo que pasa cuando se
 * acelera un vídeo en un editor sin cuidado.
 *
 * ## Y por qué `atempo` acepta este rango
 *
 * Va de 0,5 a 2. Todas las velocidades de `SPEEDS` caben de sobra, así que no
 * hace falta encadenar filtros; el tope se comprueba igual porque un valor
 * fuera de rango no se ignora: ffmpeg aborta y el vídeo se queda sin acelerar.
 *
 * ## Sin audio también vale
 *
 * Un clip suelto puede no tenerlo, y montar el filtro de sonido sobre una pista
 * que no existe hace que ffmpeg falle al construir el grafo — antes de tocar un
 * solo fotograma.
 */
export function speedArgs(
  input: string,
  out: string,
  factor: number,
  hasAudio: boolean,
): string[] {
  const speed = Math.max(0.5, Math.min(2, Number(factor) || 1));

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-filter_complex",
    hasAudio
      ? `[0:v]setpts=PTS/${speed}[v];[0:a]atempo=${speed}[a]`
      : `[0:v]setpts=PTS/${speed}[v]`,
    "-map",
    "[v]",
    ...(hasAudio ? ["-map", "[a]"] : []),
    "-c:v",
    "libx264",
    /*
     * `veryfast` y un solo núcleo.
     *
     * Esto **re-codifica vídeo**, que es lo que el proyecto evita en este
     * servidor: dos núcleos que además sirven las páginas. Con el preajuste
     * rápido un anuncio de dos minutos tarda unos minutos en vez de muchos, y
     * la diferencia de calidad en 720x1280 no se ve.
     */
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "160k"] : []),
    "-threads",
    "1",
    "-y",
    out,
  ];
}

/** Los argumentos para preguntar cuánto dura y de qué tamaño es. */
export function probeArgs(input: string): string[] {
  return [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "format=duration:stream=width,height",
    "-of",
    "json",
    input,
  ];
}

export interface Probe {
  seconds: number;
  width: number;
  height: number;
  /** Vacío si sirve; si no, por qué no. */
  problem: string;
}

/**
 * Lo que dice ffprobe, leído sin creérselo.
 *
 * Un archivo que no es vídeo devuelve JSON válido sin duración, y seguir con eso
 * daría un plan de cero fotogramas y un análisis vacío que parece que funcionó.
 */
export function readProbe(stdout: string): Probe {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { seconds: 0, width: 0, height: 0, problem: "Eso no parece un vídeo." };
  }

  const data = (parsed ?? {}) as {
    format?: { duration?: unknown };
    streams?: { width?: unknown; height?: unknown }[];
  };

  const seconds = Number(data.format?.duration);
  const stream = data.streams?.[0] ?? {};

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { seconds: 0, width: 0, height: 0, problem: "Ese archivo no tiene pista de vídeo." };
  }

  if (seconds > MAX_SECONDS) {
    return {
      seconds,
      width: 0,
      height: 0,
      problem: `Dura ${Math.round(seconds)} s y el tope son ${MAX_SECONDS}. Un anuncio no llega ahí: recórtalo o súbelo desde el navegador.`,
    };
  }

  return {
    seconds,
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0,
    problem: "",
  };
}

/**
 * Si ese enlace se puede pedir.
 *
 * La descarga la hace **el servidor**, así que sin filtro se le podría pedir que
 * se asome a la red interna —donde llega él y no llega nadie más— y devuelva lo
 * que encuentre. Es el mismo agujero que en la importación de páginas, y aquí
 * además el resultado se guarda.
 */
export function readVideoUrl(raw: string): { url: string; problem: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: "", problem: "Pega la dirección del vídeo." };

  // Solo se antepone el esquema cuando no hay ninguno: prefijarlo a `ftp://x`
  // daría `https://ftp//x`, que parsea y se cuela.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return { url: "", problem: "Esa dirección no se entiende." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { url: "", problem: "Solo enlaces http o https." };
  }

  const host = url.hostname.toLowerCase();

  const privado =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(\[?::1\]?|0\.0\.0\.0)$/.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (privado) {
    return { url: "", problem: "Esa dirección apunta a la propia red del servidor." };
  }

  return { url: url.toString(), problem: "" };
}
