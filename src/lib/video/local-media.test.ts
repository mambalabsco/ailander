import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mixMusicArgs,
MAX_SECONDS,
  audioArgs,
  downloadArgs,
  frameArgs,
  missingTools,
  probeArgs,
  readProbe,
  readVideoUrl,
  loudnormArgs,
  speedArgs,
  SPEEDS,
} from "./local-media.ts";

/* ------------------------------ Lo que falta -------------------------------- */

/*
 * Un `spawn` que falla porque el binario no existe devuelve `ENOENT`, que no le
 * dice nada a nadie.
 */
test("lo que falta se dice con el comando para instalarlo", () => {
  const aviso = missingTools({ ffmpeg: false, ffprobe: false, ytdlp: false });

  assert.match(aviso, /ffmpeg, ffprobe y yt-dlp/);
  assert.match(aviso, /apt-get install -y ffmpeg/);
  assert.match(aviso, /yt-dlp -o \/usr\/local\/bin\/yt-dlp/);
});

test("con todo instalado no se dice nada", () => {
  assert.equal(missingTools({ ffmpeg: true, ffprobe: true, ytdlp: true }), "");
});

/* ffprobe viene con ffmpeg, así que falta el paquete entero, no una parte. */
test("sin ffprobe se pide ffmpeg, que es lo que lo trae", () => {
  const aviso = missingTools({ ffmpeg: true, ffprobe: false, ytdlp: true });

  assert.match(aviso, /ffmpeg/);
  assert.ok(!aviso.includes("yt-dlp -o"));
});

/* Siempre queda la vía que no necesita nada instalado. */
test("se recuerda que subirlo por el navegador sigue funcionando", () => {
  assert.match(missingTools({ ffmpeg: false, ffprobe: false, ytdlp: false }), /lo hace el navegador/);
});

/* ------------------------------ La descarga --------------------------------- */

/* Un enlace a una lista descargaría cien vídeos sin avisar. */
test("nunca se baja una lista entera", () => {
  const args = downloadArgs("https://x/v", "/tmp/v.mp4");

  assert.ok(args.includes("--no-playlist"));
  assert.ok(args.includes("--playlist-items"));
});

/*
 * Los fotogramas se escalan a 768 px de todas formas: bajar 4K es decodificar
 * dieciséis veces más píxeles para tirarlos después.
 */
test("se pide el formato pequeño, no el mejor", () => {
  assert.match(downloadArgs("https://x/v", "/tmp/v.mp4").join(" "), /height<=720/);
});

test("hay tope de tamaño y de espera", () => {
  const args = downloadArgs("https://x/v", "/tmp/v.mp4");

  assert.ok(args.includes("--max-filesize"));
  assert.ok(args.includes("--socket-timeout"));
});

/* ------------------------------ Los fotogramas ------------------------------ */

/*
 * `-ss` antes de `-i` hace que ffmpeg salte directo al punto. Detrás, decodifica
 * el vídeo entero hasta llegar: con veinte fotogramas de dos minutos, eso es la
 * diferencia entre acabar y no acabar.
 */
test("el salto va antes de la entrada", () => {
  const args = frameArgs("/tmp/v.mp4", 12.5, "/tmp/f.jpg");

  assert.ok(args.indexOf("-ss") < args.indexOf("-i"));
  assert.equal(args[args.indexOf("-ss") + 1], "12.50");
});

test("solo sale un fotograma por llamada", () => {
  const args = frameArgs("/tmp/v.mp4", 1, "/tmp/f.jpg");
  assert.equal(args[args.indexOf("-frames:v") + 1], "1");
});

/* Dos núcleos: dejar que ffmpeg se los coma deja la plataforma sin responder. */
test("ffmpeg se queda en un hilo", () => {
  assert.equal(frameArgs("/tmp/v.mp4", 1, "/tmp/f.jpg")[frameArgs("/tmp/v.mp4", 1, "/tmp/f.jpg").indexOf("-threads") + 1], "1");
  assert.equal(audioArgs("/tmp/v.mp4", "/tmp/a.wav")[audioArgs("/tmp/v.mp4", "/tmp/a.wav").indexOf("-threads") + 1], "1");
});

/* Mono a 16 kHz es lo que pide el transcriptor y una décima parte del tamaño. */
test("el audio sale mono y a 16 kHz", () => {
  const args = audioArgs("/tmp/v.mp4", "/tmp/a.wav");

  assert.equal(args[args.indexOf("-ac") + 1], "1");
  assert.equal(args[args.indexOf("-ar") + 1], "16000");
  assert.ok(args.includes("-vn"));
});

test("se le pregunta a ffprobe en JSON y solo por lo que hace falta", () => {
  const args = probeArgs("/tmp/v.mp4");

  assert.ok(args.includes("json"));
  assert.match(args.join(" "), /format=duration/);
});

/* -------------------------------- La lectura -------------------------------- */

test("un vídeo normal se lee entero", () => {
  const probe = readProbe(
    JSON.stringify({ format: { duration: "31.5" }, streams: [{ width: 1080, height: 1920 }] }),
  );

  assert.equal(probe.problem, "");
  assert.equal(probe.seconds, 31.5);
  assert.equal(probe.width, 1080);
});

/*
 * Un archivo que no es vídeo devuelve JSON válido sin duración, y seguir con eso
 * daría un plan de cero fotogramas y un análisis vacío que parece que funcionó.
 */
test("sin duración no se sigue", () => {
  const probe = readProbe(JSON.stringify({ format: {}, streams: [] }));

  assert.match(probe.problem, /no tiene pista de vídeo/);
});

test("lo que no es JSON tampoco", () => {
  assert.match(readProbe("no soy json").problem, /no parece un vídeo/);
});

test("un vídeo demasiado largo se rechaza diciendo el tope", () => {
  const probe = readProbe(JSON.stringify({ format: { duration: String(MAX_SECONDS + 60) } }));

  assert.match(probe.problem, new RegExp(String(MAX_SECONDS)));
});

/* --------------------------------- El enlace -------------------------------- */

test("una dirección normal pasa", () => {
  assert.equal(readVideoUrl("https://www.tiktok.com/@x/video/1").problem, "");
});

test("se acepta pegarla sin el esquema", () => {
  assert.equal(readVideoUrl("tiktok.com/@x/video/1").url, "https://tiktok.com/@x/video/1");
});

/*
 * Prefijar el esquema a lo que ya tiene uno daría `https://ftp//x`, que parsea y
 * se cuela. Es el mismo fallo que ya se encontró en la importación de páginas.
 */
test("un esquema raro se rechaza, no se disfraza", () => {
  assert.match(readVideoUrl("ftp://servidor/x.mp4").problem, /http o https/);
  assert.match(readVideoUrl("file:///etc/passwd").problem, /http o https/);
});

/*
 * La descarga la hace el servidor: sin filtro se le podría pedir que se asome a
 * la red interna y devuelva lo que encuentre — y aquí el resultado se guarda.
 */
test("la red interna no se toca", () => {
  for (const host of [
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://10.0.0.5/x",
    "http://192.168.1.1/x",
    "http://172.16.0.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://algo.internal/x",
  ]) {
    assert.match(readVideoUrl(host).problem, /red del servidor/, host);
  }
});

test("vacío pide la dirección en vez de fallar raro", () => {
  assert.match(readVideoUrl("   ").problem, /Pega la dirección/);
});

/* ------------------------- Nivelar música en el servidor ------------------- */

test("la salida es MP3, que es la razón de hacerlo aquí", () => {
  /*
   * El servicio de fuera devuelve WAV sin comprimir: se le manda un MP3 de dos
   * megas y devuelve ochenta y siete. Eso no cabe en el almacenamiento, y
   * aunque cupiera sería guardar cuarenta veces lo que hace falta.
   */
  const args = loudnormArgs("/tmp/entra.mp3", "/tmp/sale.mp3", -30);

  assert.ok(args.includes("libmp3lame"));
  assert.ok(!args.some((arg) => /wav/i.test(arg)));
});

test("el volumen pedido va en el filtro", () => {
  const args = loudnormArgs("/tmp/a.mp3", "/tmp/b.mp3", -27);

  assert.ok(args.some((arg) => arg.includes("loudnorm=I=-27")));
});

test("un volumen imposible se recorta al rango del filtro", () => {
  // Un valor fuera de rango no se ignora: ffmpeg aborta y la pista se queda
  // sin ajustar, que es peor que ajustarla mal.
  assert.ok(loudnormArgs("/a", "/b", -900).some((arg) => arg.includes("I=-70")));
  assert.ok(loudnormArgs("/a", "/b", 40).some((arg) => arg.includes("I=-5")));
});

test("lleva tope de pico", () => {
  // Sin él, un golpe suelto satura aunque la media esté bien, y eso se oye como
  // un chasquido encima de la voz.
  assert.ok(loudnormArgs("/a", "/b", -30).some((arg) => arg.includes("TP=-1.5")));
});

test("descarta el vídeo, por las carátulas", () => {
  // Hay MP3 con carátula, y sin esto ffmpeg intenta copiarla.
  assert.ok(loudnormArgs("/a", "/b", -30).includes("-vn"));
});

test("un solo núcleo, como el resto", () => {
  // El servidor tiene dos y sirve páginas con ellos.
  const args = loudnormArgs("/a", "/b", -30);
  const at = args.indexOf("-threads");

  assert.equal(args[at + 1], "1");
});

test("la entrada y la salida van donde se dice", () => {
  const args = loudnormArgs("/tmp/entra.mp3", "/tmp/sale.mp3", -30);

  assert.equal(args[args.indexOf("-i") + 1], "/tmp/entra.mp3");
  assert.equal(args[args.length - 1], "/tmp/sale.mp3");
});

test("falta ffprobe y no se acusa a ffmpeg", () => {
  /*
   * Esto metía «ffmpeg» en la lista cuando lo que faltaba era `ffprobe`, y el
   * mensaje mandaba a instalar algo que ya estaba. Quien lo lee hace lo que
   * dice, comprueba que ya está, y deja de creerse el aviso.
   */
  const texto = missingTools({ ffmpeg: true, ffprobe: false, ytdlp: true });

  assert.match(texto, /ffprobe/);
  assert.ok(!/falta ffmpeg\b/.test(texto));
});

test("con todo instalado no sobra ningún aviso", () => {
  assert.equal(missingTools({ ffmpeg: true, ffprobe: true, ytdlp: true }), "");
});

test("faltando solo yt-dlp no se menciona ffmpeg como ausente", () => {
  // Es lo que hacía creer que faltaba ffmpeg cuando estaba puesto.
  const texto = missingTools({ ffmpeg: true, ffprobe: true, ytdlp: false });

  assert.match(texto, /yt-dlp/);
  assert.ok(!/le falta ffmpeg/.test(texto));
});

/* ------------------------------ Acelerar un poco --------------------------- */

test("la imagen y el sonido se aceleran a la vez", () => {
  /*
   * Aplicar solo `setpts` es el error clásico: el vídeo dura menos, el audio
   * sigue igual y el montador lo recorta. No da error — sale un anuncio en el
   * que la boca va por delante de la voz y falta la última frase.
   */
  const args = speedArgs("/a.mp4", "/b.mp4", 1.1, true);
  const filtro = args[args.indexOf("-filter_complex") + 1];

  assert.match(filtro, /setpts=PTS\/1\.1/);
  assert.match(filtro, /atempo=1\.1/);
});

test("se usa atempo y no asetrate, para no cambiar el tono", () => {
  // Con `asetrate` la voz subiría de tono y sonaría a dibujo animado.
  const args = speedArgs("/a.mp4", "/b.mp4", 1.2, true);

  assert.ok(!args.some((arg) => /asetrate/.test(arg)));
});

test("un vídeo sin audio no monta el filtro de sonido", () => {
  // Montarlo sobre una pista que no existe hace que ffmpeg falle al construir
  // el grafo, antes de tocar un solo fotograma.
  const args = speedArgs("/a.mp4", "/b.mp4", 1.1, false);
  const filtro = args[args.indexOf("-filter_complex") + 1];

  assert.ok(!filtro.includes("atempo"));
  assert.ok(!args.includes("[a]"));
});

test("una velocidad imposible se recorta al rango de atempo", () => {
  // Fuera de 0,5–2 ffmpeg aborta y el vídeo se queda sin acelerar.
  const rapido = speedArgs("/a", "/b", 9, true)[
    speedArgs("/a", "/b", 9, true).indexOf("-filter_complex") + 1
  ];

  assert.match(rapido, /atempo=2/);
});

test("todas las velocidades ofrecidas caben en atempo", () => {
  for (const speed of SPEEDS) {
    assert.ok(speed >= 0.5 && speed <= 2, String(speed));
  }
});

test("solo se ofrecen aceleraciones pequeñas", () => {
  /*
   * A 1,1x se lee como más enérgico y no se nota; a 1,5x se nota, y lo que se
   * nota deja de convencer y parece un truco.
   */
  assert.ok(SPEEDS.every((speed) => speed > 1 && speed <= 1.2));
});

test("un solo núcleo y preajuste rápido", () => {
  // Re-codifica vídeo en un servidor de dos núcleos que además sirve páginas.
  const args = speedArgs("/a", "/b", 1.1, true);

  assert.equal(args[args.indexOf("-threads") + 1], "1");
  assert.equal(args[args.indexOf("-preset") + 1], "veryfast");
});

/* --------------------- Mezclar la música sobre el vídeo -------------------- */

test("la imagen se copia, no se recodifica", () => {
  /*
   * Es lo que hace que esto dure segundos en un servidor de dos núcleos en vez
   * de minutos, y de paso la imagen no pierde nada: recodificar por segunda vez
   * sí se nota.
   */
  const args = mixMusicArgs("/v.mp4", "/m.mp3", "/out.mp4");

  assert.equal(args[args.indexOf("-c:v") + 1], "copy");
});

test("se mezclan las dos pistas, no se sustituye una", () => {
  /*
   * El servicio de montaje sustituye el audio por lo que se le da: el vídeo
   * salía con música y **sin voz**. La voz ya está dentro del vídeo, así que
   * aquí hay que sumar, no reemplazar.
   */
  const filtro = mixMusicArgs("/v.mp4", "/m.mp3", "/o.mp4")[
    mixMusicArgs("/v.mp4", "/m.mp3", "/o.mp4").indexOf("-filter_complex") + 1
  ];

  assert.match(filtro, /\[0:a\]\[1:a\]amix/);
});

test("la música se corta al acabar el vídeo, por dos vías", () => {
  /*
   * `duration=first` decide cuánto dura la mezcla y `-shortest` cuánto dura el
   * archivo. Los dos, y no sobra ninguno: esto se dio por arreglado dos veces
   * —la primera poniéndole duración al fotograma del servicio de montaje, que
   * la ignoraba— y el corte no debería depender de una sola cosa.
   */
  const args = mixMusicArgs("/v.mp4", "/m.mp3", "/o.mp4");

  assert.ok(args.some((arg) => arg.includes("duration=first")));
  assert.ok(args.includes("-shortest"));
});
