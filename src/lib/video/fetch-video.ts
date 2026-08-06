import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { framePlan } from "@/lib/video/analysis";
import {
  audioArgs,
  downloadArgs,
  frameArgs,
  missingTools,
  probeArgs,
  readProbe,
  readVideoUrl,
  loudnormArgs,
} from "@/lib/video/local-media";

/**
 * Bajar un vídeo de un enlace y sacarle fotogramas y audio.
 *
 * ## Por qué existe si eso lo hacía el navegador
 *
 * Porque el navegador solo puede con lo que está en el ordenador. Un anuncio de
 * otro está en TikTok o en la biblioteca de Meta, en otro dominio: no lo puede
 * descargar ni decodificar. Hasta ahora había que bajarlo a mano, guardarlo y
 * volver a subirlo.
 *
 * Sigue siendo el camino de excepción. Cuando el archivo está delante, lo hace
 * el navegador y el servidor no se entera; esto es para cuando el otro no puede.
 *
 * ## Lo que se ejecuta y lo que no
 *
 * Se llama a `yt-dlp` y a `ffmpeg` con **listas de argumentos**, nunca con una
 * cadena de shell. La dirección la escribe una persona y acaba en la línea de
 * comandos: con `sh -c`, un `; rm -rf` dentro de esa dirección sería un comando
 * más. Con una lista, es un argumento y punto.
 *
 * ## Y lo que se limpia
 *
 * Todo, en `finally`. El vídeo, los fotogramas y el audio viven en una carpeta
 * temporal que se borra pase lo que pase: en un disco de servidor pequeño, unos
 * cuantos vídeos olvidados lo llenan, y un disco lleno no da un error claro —
 * da fallos raros en todo lo demás.
 */

/** Lo que se espera como mucho a cada programa. */
const DOWNLOAD_MS = 180_000;
const FFMPEG_MS = 60_000;

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], timeoutMs: number): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      done = true;
      child.kill("SIGKILL");
      reject(new Error(`${command} tardó demasiado y se paró.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      // Un vídeo por la salida estándar llenaría la memoria: aquí solo vienen
      // mensajes, pero el tope evita que un programa raro tire el proceso.
      if (stdout.length < 1_000_000) stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 200_000) stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!done) reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (!done) resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function has(command: string): Promise<boolean> {
  try {
    const { code } = await run(command, ["--version"], 10_000);
    return code === 0;
  } catch {
    return false;
  }
}

/** Qué le falta al servidor, o cadena vacía si no le falta nada. */
export async function videoToolsProblem(): Promise<string> {
  const [ffmpeg, ffprobe, ytdlp] = await Promise.all([
    has("ffmpeg"),
    has("ffprobe"),
    has("yt-dlp"),
  ]);

  return missingTools({ ffmpeg, ffprobe, ytdlp });
}

export interface FetchedVideo {
  seconds: number;
  width: number;
  height: number;
  /** Los fotogramas, en el orden de sus marcas. */
  frames: { at: number; jpeg: Buffer }[];
  /** El audio en WAV mono 16 kHz, o `null` si el vídeo no tenía. */
  audio: Buffer | null;
}

/**
 * Baja el vídeo del enlace y devuelve lo que hace falta para analizarlo.
 *
 * Los fotogramas se sacan **de uno en uno y en serie**. Lanzar veinte ffmpeg a
 * la vez en dos núcleos no acaba antes: acaba con la plataforma sin responder
 * para quien la esté usando en ese momento.
 */
export async function fetchVideo(
  rawUrl: string,
  report: (message: string) => Promise<void>,
): Promise<FetchedVideo> {
  const problem = await videoToolsProblem();
  if (problem) throw new Error(problem);

  const { url, problem: badUrl } = readVideoUrl(rawUrl);
  if (badUrl) throw new Error(badUrl);

  const dir = await mkdtemp(join(tmpdir(), "ref-video-"));
  const video = join(dir, "video.mp4");

  try {
    await report("Bajando el vídeo");

    const download = await run("yt-dlp", downloadArgs(url, video), DOWNLOAD_MS);

    if (download.code !== 0) {
      /*
       * El motivo de yt-dlp, no un «falló».
       *
       * Sus fallos son casi siempre accionables —vídeo privado, hace falta
       * sesión, región bloqueada— y esconderlos deja a quien lo usa probando el
       * mismo enlace otra vez.
       */
      throw new Error(
        `No se pudo bajar ese vídeo: ${download.stderr.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}`,
      );
    }

    const probed = await run("ffprobe", probeArgs(video), FFMPEG_MS);
    const probe = readProbe(probed.stdout);

    if (probe.problem) throw new Error(probe.problem);

    const marks = framePlan(probe.seconds);
    const frames: { at: number; jpeg: Buffer }[] = [];

    for (const [index, at] of marks.entries()) {
      await report(`Sacando el fotograma ${index + 1} de ${marks.length}`);

      const out = join(dir, `f-${String(index).padStart(2, "0")}.jpg`);

      try {
        await run("ffmpeg", frameArgs(video, at, out), FFMPEG_MS);
        frames.push({ at, jpeg: await readFile(out) });
      } catch {
        /*
         * Un fotograma que no sale no tira el análisis.
         *
         * Cerca del final es normal —muchos codificadores no tienen fotograma
         * ahí— y con diecinueve de veinte el análisis sale igual de bien.
         */
      }
    }

    if (frames.length === 0) {
      throw new Error("Se bajó el vídeo pero no salió ningún fotograma. ¿Seguro que es un vídeo?");
    }

    await report("Sacando el audio");

    const wav = join(dir, "audio.wav");
    let audio: Buffer | null = null;

    try {
      await run("ffmpeg", audioArgs(video, wav), FFMPEG_MS);
      audio = await readFile(wav);
    } catch {
      // Un anuncio de solo texto en pantalla es un formato normal: sin audio se
      // analiza igual, con la mitad de la información en vez de con toda.
    }

    return {
      seconds: probe.seconds,
      width: probe.width,
      height: probe.height,
      frames,
      audio,
    };
  } finally {
    // Pase lo que pase. Unos cuantos vídeos olvidados llenan el disco de un
    // servidor pequeño, y un disco lleno no da un error claro: da fallos raros
    // en todo lo demás.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Deja una pista de música al volumen pedido, en el servidor.
 *
 * ## Por qué esta sí va aquí y el montaje no
 *
 * El montaje codifica **vídeo** —unos cincuenta segundos por minuto en
 * dieciséis núcleos— y en los dos de este servidor dejaría la plataforma
 * arrastrándose varios minutos. Normalizar audio no decodifica imagen: son unos
 * segundos para una pista de dos minutos.
 *
 * Y hacerlo fuera tenía un problema que no se arregla pagando: el servicio
 * devuelve **WAV sin comprimir**. Se le mandaba un MP3 de dos megas y devolvía
 * ochenta y siete, que no caben en el almacenamiento — y aunque cupieran, sería
 * guardar cuarenta veces lo que hace falta para una cama de fondo.
 *
 * Devuelve los bytes ya en MP3. Quien llame decide dónde guardarlos: este
 * archivo no sabe de almacenamiento y así se puede usar desde cualquier sitio.
 */
export async function levelAudio(
  source: string,
  lufs: number,
): Promise<{ bytes: Uint8Array; problem: string }> {
  /*
   * Sin comprobación previa: se ejecuta y se cuenta lo que pase.
   *
   * Aquí hubo dos versiones y las dos mintieron. La primera decidía mirando el
   * texto de un diagnóstico con una expresión regular; la segunda preguntaba
   * antes con `hasTool`, que **se traga el motivo** —`catch { return false }`—
   * y por tanto solo sabía decir «no está», que era falso: el binario estaba en
   * `/usr/bin` y en el PATH del servicio.
   *
   * Preguntar antes es un proceso más y un modo de fallo más, y no aporta nada:
   * si ffmpeg no se puede ejecutar, intentarlo lo dice igual **y con el error
   * de verdad**. Un «no está instalado» inventado manda a instalar algo que ya
   * está, y eso cuesta más que no decir nada.
   */

  const dir = await mkdtemp(join(tmpdir(), "musica-"));

  try {
    const response = await fetch(source, { cache: "no-store" });

    if (!response.ok) {
      return { bytes: new Uint8Array(), problem: `no se pudo descargar la pista (${response.status}).` };
    }

    const entra = join(dir, "entra");
    const sale = join(dir, "sale.mp3");

    await writeFile(entra, Buffer.from(await response.arrayBuffer()));

    let ran;

    try {
      ran = await run("ffmpeg", loudnormArgs(entra, sale, lufs), FFMPEG_MS);
    } catch (error) {
      /*
       * Aquí es donde se sabe de verdad si falta.
       *
       * `spawn` lanza `ENOENT` cuando el programa no existe en el PATH del
       * proceso, y ese error trae el nombre y el código. Cualquier otra cosa
       * —permisos, memoria, el plazo agotado— llega con su propio mensaje en
       * vez de convertirse en «no está instalado».
       */
      const why = error instanceof Error ? error.message : String(error);

      return {
        bytes: new Uint8Array(),
        problem: /ENOENT/i.test(why)
          ? "el proceso de la plataforma no encuentra ffmpeg en su PATH (instalado para tu usuario no basta si el servicio arranca con otro entorno)."
          : `no se pudo ejecutar ffmpeg: ${why.slice(0, 160)}`,
      };
    }

    if (ran.code !== 0) {
      // La última línea de ffmpeg es la que dice qué pasó; el resto es ruido.
      const last = ran.stderr.trim().split("\n").pop() ?? "";
      return { bytes: new Uint8Array(), problem: `ffmpeg falló: ${last.slice(0, 160)}` };
    }

    return { bytes: new Uint8Array(await readFile(sale)), problem: "" };
  } catch (error) {
    return {
      bytes: new Uint8Array(),
      problem: error instanceof Error ? error.message : "no se pudo ajustar.",
    };
  } finally {
    // Como el resto: en un disco pequeño, unos cuantos temporales olvidados lo
    // llenan, y un disco lleno no da un error claro — da fallos raros en todo.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
