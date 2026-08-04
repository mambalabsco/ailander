import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_SECONDS,
  audioArgs,
  downloadArgs,
  frameArgs,
  missingTools,
  probeArgs,
  readProbe,
  readVideoUrl,
} from "./local-media.ts";

/* ------------------------------ Lo que falta -------------------------------- */

/*
 * Un `spawn` que falla porque el binario no existe devuelve `ENOENT`, que no le
 * dice nada a nadie.
 */
test("lo que falta se dice con el comando para instalarlo", () => {
  const aviso = missingTools({ ffmpeg: false, ffprobe: false, ytdlp: false });

  assert.match(aviso, /ffmpeg y yt-dlp/);
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
