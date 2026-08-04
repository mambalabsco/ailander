import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  declaredMediaParams,
  describePayload,
  findModelList,
  extractMediaUrls,
  MEDIA_PARAMS,
  type MediaKind,
} from "@/lib/higgsfield-urls";

const run = promisify(execFile);

/**
 * Higgsfield a través de su CLI oficial.
 *
 * **Por qué existe esto además del cliente de API.** Higgsfield son dos
 * productos con catálogos distintos:
 *
 * - `platform.higgsfield.ai` — clave id:secreto, 7 modelos en esta cuenta.
 * - El CLI — login OAuth por navegador, 40+ modelos, **incluido Nano Banana
 *   Pro**, y con imágenes de referencia.
 *
 * Se comprobó a fondo que Nano Banana Pro no está en la primera: 56
 * combinaciones de nombre, todas 404, con un control que distinguía «no existe»
 * (404) de «existe pero tu plan no lo incluye» (423). Tampoco entiende ningún
 * campo de imágenes de referencia: siete nombres candidatos, todos ignorados.
 *
 * Así que para Nano Banana Pro y para mandar la foto del producto, el CLI es el
 * único camino. Dos cosas lo hacen viable en un servidor:
 *
 * 1. **Las credenciales llevan `refresh_token`**, así que un solo login por
 *    navegador se renueva solo. No hay que entrar cada día.
 * 2. **Las banderas de media aceptan una ruta local y la suben ellas.** No hace
 *    falta implementar la subida.
 *
 * Y una trampa: **cuando no hay sesión, el CLI termina con código 0** y escribe
 * «Not authenticated» en la salida. Fiarse del código de salida daría por buena
 * una generación que nunca ocurrió.
 */

/**
 * Ruta al binario.
 *
 * El CLI está como dependencia del proyecto (`@higgsfield/cli`), así que vive en
 * `node_modules/.bin`. Eso **no está en el PATH** de un proceso hijo lanzado
 * desde el servidor —solo lo está dentro de un script de npm—, y buscar
 * «higgsfield» a secas daría ENOENT en producción aunque esté instalado. Por eso
 * se resuelve la ruta explícita, con el PATH global como último recurso para
 * quien lo tenga instalado a mano.
 */
function binary(): string {
  if (process.env.HIGGSFIELD_CLI_PATH) return process.env.HIGGSFIELD_CLI_PATH;

  const local = path.join(process.cwd(), "node_modules", ".bin", "higgsfield");
  return existsSync(local) ? local : "higgsfield";
}

/** Un login puede tardar; una generación con Nano Banana Pro, varios minutos. */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export interface CliModel {
  slug: string;
  title: string;
  /** `text2image`, `image2video`… tal y como lo devuelve el CLI. */
  jobType: string;
  /**
   * Con qué banderas acepta imágenes: `image_references`, `start_image`…
   *
   * `null` cuando el listado no trae los parámetros de cada modelo: entonces se
   * resuelve con `modelMediaParams` justo antes de generar. Nunca se asume.
   */
  mediaParams: string[] | null;
  /** Si acepta la foto del producto como referencia. Atajo sobre lo anterior. */
  acceptsReferences: boolean | null;
}

export interface CliStatus {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  reason?: string;
  /** Dónde está buscando la sesión, y de quién es esa carpeta. */
  home?: string;
  credentialsPath?: string;
  hasCredentials?: boolean;
}

/**
 * Dónde guarda el CLI la sesión, y si está ahí.
 *
 * ## Por qué esto hace falta
 *
 * «Sin sesión» no dice **de quién**. El CLI guarda las credenciales en el
 * `~/.config/higgsfield` de quien ejecuta el comando, y la plataforma corre como
 * su propio usuario de sistema. Iniciar sesión por SSH como otro —o con `sudo`,
 * que cambia el `HOME`— deja el archivo en una carpeta que la plataforma no mira
 * nunca: el login sale bien, y aquí sigue diciendo que no hay sesión.
 *
 * Es el mismo síntoma con dos causas muy distintas, y sin decir la ruta no hay
 * forma de saber cuál.
 */
function credentialsFile(): { home: string; path: string; exists: boolean } {
  const home = process.env.HOME?.trim() || "";
  const path = home ? `${home}/.config/higgsfield/credentials.json` : "";

  return { home, path, exists: Boolean(path) && existsSync(path) };
}

async function exec(
  args: string[],
  timeoutMs = 60_000,
): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  try {
    const { stdout, stderr } = await run(binary(), args, {
      timeout: timeoutMs,
      // Los informes y prompts largos desbordan el búfer por defecto.
      maxBuffer: 32 * 1024 * 1024,
      env: process.env,
    });
    return { stdout, stderr, failed: false };
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string; code?: string; message?: string };

    if (shell.code === "ENOENT") {
      throw new Error(
        "No encuentro el CLI de Higgsfield. Instálalo con «curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh | sh», o indica su ruta en HIGGSFIELD_CLI_PATH.",
      );
    }

    return {
      stdout: shell.stdout ?? "",
      stderr: shell.stderr ?? shell.message ?? "",
      failed: true,
    };
  }
}

/**
 * El CLI escribe «Not authenticated» y **sale con código 0**.
 *
 * Por eso la comprobación mira el texto y no el código: sin esto, una
 * generación sin sesión parecería haber salido bien y devolvería vacío.
 */
function looksUnauthenticated(output: string): boolean {
  return /not authenticated|session expired|auth login/i.test(output);
}

/** El CLI exige un workspace activo antes de generar nada. */
function needsWorkspace(output: string): boolean {
  return /no workspace selected|workspace set/i.test(output);
}

/**
 * Deja un workspace seleccionado, si hace falta y si no hay duda.
 *
 * **Existe porque una tanda entera falló por esto.** El CLI acepta el login pero
 * no elige workspace solo: sin uno activo, cada generación termina con «No
 * workspace selected» — y como el CLI sale con código 0, parecía que la
 * generación se había hecho y no había devuelto imágenes.
 *
 * Con una sola cuenta se elige sola: no hay ambigüedad y pedir un paso manual
 * para una decisión sin alternativas es hacer perder el tiempo. Con varias **no
 * se adivina**: cada una tiene sus propios créditos, y elegir por ti gastaría de
 * un bolsillo que no decidiste.
 */
async function ensureWorkspace(): Promise<void> {
  const status = await exec(["workspace", "status", "--json"], 20_000);
  const statusText = `${status.stdout}\n${status.stderr}`;

  if (looksUnauthenticated(statusText)) {
    throw new Error("El CLI de Higgsfield no tiene sesión. Ejecuta «higgsfield auth login».");
  }

  // Ya hay uno elegido: no se toca.
  if (!needsWorkspace(statusText) && /"id"\s*:/.test(status.stdout)) return;

  const { stdout } = await exec(["workspace", "list", "--json"], 20_000);

  let workspaces: { id?: string; name?: string | null; credits?: number }[] = [];
  try {
    const payload = JSON.parse(stdout);
    workspaces = Array.isArray(payload) ? payload : (payload?.items ?? []);
  } catch {
    throw new Error(
      "No se pudo leer la lista de workspaces de Higgsfield. Ejecuta «npx higgsfield workspace list».",
    );
  }

  if (workspaces.length === 0) {
    throw new Error("Tu cuenta de Higgsfield no tiene ningún workspace disponible.");
  }

  if (workspaces.length > 1) {
    const options = workspaces
      .map((item) => `${item.name || "(sin nombre)"} — ${item.id}`)
      .join("; ");
    throw new Error(
      `Tienes varios workspaces de Higgsfield y cada uno gasta sus propios créditos. Elige uno con «npx higgsfield workspace set <id>»: ${options}`,
    );
  }

  const only = workspaces[0].id;
  if (!only) throw new Error("El workspace de Higgsfield no trae identificador.");

  await exec(["workspace", "set", only], 20_000);
}

export async function cliStatus(): Promise<CliStatus> {
  const file = credentialsFile();

  const where = {
    home: file.home,
    credentialsPath: file.path,
    hasCredentials: file.exists,
  };

  let version: string | undefined;

  try {
    const { stdout } = await exec(["version"], 15_000);
    version = stdout.trim().split("\n")[0];
  } catch (error) {
    return {
      ...where,
      installed: false,
      authenticated: false,
      reason: error instanceof Error ? error.message : "No se pudo ejecutar el CLI.",
    };
  }

  const { stdout, stderr } = await exec(["auth", "token"], 15_000);
  const combined = `${stdout}\n${stderr}`;

  if (looksUnauthenticated(combined)) {
    /*
     * El archivo existiendo y el CLI diciendo que no hay sesión son dos cosas
     * distintas, y se arreglan distinto: si no está, hay que iniciar sesión
     * **como este usuario**; si está, la sesión caducó y hay que renovarla.
     */
    return {
      ...where,
      installed: true,
      authenticated: false,
      version,
      reason: file.exists
        ? `La sesión guardada en ${file.path} ya no vale. Vuelve a iniciarla con ese mismo usuario.`
        : `No hay sesión en ${file.path || "el HOME del servicio"}. El CLI la guarda en el HOME de quien ejecuta el comando, así que hay que iniciarla **con el usuario que corre la plataforma** — con «sudo» o con otro usuario, el archivo acaba en otra carpeta y aquí no se ve.`,
    };
  }

  return { ...where, installed: true, authenticated: true, version };
}

/**
 * Los modelos del CLI de un tipo.
 *
 * El filtro lo hace el propio CLI con `--image` o `--video`. Sin bandera llegan
 * los cuatro tipos mezclados —también audio y texto— y habría que adivinar
 * cuáles descartar por el nombre.
 */
export async function listCliModels(kind: "image" | "video" = "image"): Promise<CliModel[]> {
  const { stdout, stderr } = await exec(["model", "list", `--${kind}`, "--json"], 30_000);
  const combined = `${stdout}\n${stderr}`;

  if (looksUnauthenticated(combined)) {
    throw new Error("El CLI de Higgsfield no tiene sesión. Ejecuta «higgsfield auth login».");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error(`El CLI no devolvió JSON: ${combined.slice(0, 200)}`);
  }

  const items = findModelList(payload);

  /*
   * Que no haya lista y que la lista esté vacía son cosas distintas.
   *
   * Lo primero es que la respuesta cambió de forma y hay que mirarla; lo
   * segundo es que de verdad no hay modelos de ese tipo. Decir «no devolvió
   * ninguno» en los dos casos deja la investigación sin empezar, así que aquí
   * se dice qué llegó.
   */
  if (!items) {
    throw new Error(
      `El CLI respondió ${describePayload(payload)} y ahí no hay ninguna lista de modelos. Puede que haya cambiado el formato: ${stdout.slice(0, 200)}`,
    );
  }

  return items
    .map((item) => ({
      slug: String(item.job_type ?? item.slug ?? item.name ?? ""),
      title: String(item.title ?? item.display_name ?? item.job_type ?? item.slug ?? ""),
      jobType: String(item.output_type ?? item.type ?? ""),
      // Si el listado trae los parámetros, ya se sabe; si no, `null` y se
      // preguntará por el modelo concreto. Un `false` aquí sería mentir.
      mediaParams: hasParams(item) ? declaredMediaParams(item) : null,
      acceptsReferences: hasParams(item)
        ? declaredMediaParams(item).includes("image_references")
        : null,
    }))
    .filter((model) => model.slug);
}

/** Si esta entrada del listado describe sus parámetros o solo se nombra. */
function hasParams(item: Record<string, unknown>): boolean {
  return Boolean(item.params ?? item.parameters ?? item.inputs ?? item.schema);
}

/**
 * Con qué banderas acepta imágenes un modelo concreto.
 *
 * Una llamada por modelo elegido, no por modelo del catálogo: `model get` es una
 * ida y vuelta a la API y hacerla cuarenta veces para pintar un desplegable
 * dejaría la página en blanco varios segundos.
 *
 * Ante la duda devuelve lista vacía: generar sin la referencia da un resultado
 * mejorable, mientras que mandarla a un modelo que no la entiende aborta la
 * generación entera con «Unknown params».
 */
export async function modelMediaParams(slug: string): Promise<string[]> {
  const { stdout, stderr } = await exec(["model", "get", slug, "--json"], 30_000);

  if (looksUnauthenticated(`${stdout}\n${stderr}`)) {
    throw new Error("El CLI de Higgsfield no tiene sesión. Ejecuta «higgsfield auth login».");
  }

  try {
    return declaredMediaParams(JSON.parse(stdout));
  } catch {
    return [];
  }
}

/** Si un modelo concreto acepta la foto del producto como referencia. */
export async function modelAcceptsReferences(slug: string): Promise<boolean> {
  return (await modelMediaParams(slug)).includes("image_references");
}

export interface CliGenerationResult {
  imageUrls: string[];
  raw: string;
}

/**
 * Genera con el CLI, con imágenes de referencia opcionales.
 *
 * Las referencias llegan como bytes —vienen del bucket privado, no de una URL
 * pública— y se escriben en un directorio temporal porque las banderas del CLI
 * esperan una ruta. Se borra siempre, también si la generación falla.
 *
 * `kind` decide qué URL se recoge del resultado. Un modelo de vídeo devuelve el
 * clip **y** su miniatura, así que buscar imágenes en su salida encontraría el
 * `.jpg` de la miniatura y lo guardaría como si fuera el vídeo.
 */
export async function generateWithCli(options: {
  model: string;
  prompt: string;
  /** Imágenes de referencia ya descargadas. El CLI las sube él. */
  references?: { filename: string; bytes: Uint8Array }[];
  /** Qué se espera de vuelta. Por defecto, imágenes. */
  kind?: MediaKind;
  /**
   * Con qué bandera mandar las referencias.
   *
   * Se resuelve preguntándole al modelo, no suponiendo: el que hace vídeo desde
   * un primer fotograma quiere `--start-image` y el que mantiene un personaje
   * quiere `--image-references`. La equivocada aborta con «Unknown params».
   */
  referenceParam?: string;
  aspectRatio?: string;
  resolution?: string;
  timeoutMs?: number;
}): Promise<CliGenerationResult> {
  const references = options.references ?? [];
  const kind = options.kind ?? "imagen";
  let workdir: string | null = null;

  // Antes de gastar: sin workspace activo la generación falla siempre, y el
  // código de salida 0 del CLI la haría parecer un resultado vacío.
  await ensureWorkspace();

  try {
    const args = ["generate", "create", options.model, "--prompt", options.prompt];

    if (options.aspectRatio) args.push("--aspect_ratio", options.aspectRatio);
    if (options.resolution) args.push("--resolution", options.resolution);

    if (references.length > 0) {
      const flag = MEDIA_PARAMS[options.referenceParam ?? "image_references"];

      if (!flag) {
        throw new Error(
          `No sé con qué bandera mandarle las imágenes a ${options.model} («${options.referenceParam}»).`,
        );
      }

      workdir = await mkdtemp(path.join(tmpdir(), "higgsfield-"));

      // Los que quieren un primer fotograma aceptan **uno**: mandarles varios
      // repetiría la bandera y el CLI se queda con el último sin avisar.
      const usable = flag === "--image-references" ? references : references.slice(0, 1);

      for (const reference of usable) {
        // Nombre saneado: el del archivo original puede traer cualquier cosa y
        // acaba siendo un argumento de línea de comandos.
        const safe = reference.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
        const file = path.join(workdir, safe || "referencia.png");
        await writeFile(file, reference.bytes);
        args.push(flag, file);
      }
    }

    /*
     * `--wait` bloquea hasta que termina y `--json` da la respuesta cruda.
     *
     * `--wait-timeout` va atado al mismo plazo que el proceso: si el CLI
     * esperase más que nosotros, matarlo por timeout dejaría una generación ya
     * pagada sin recoger. Así se rinde él primero y escribe por qué.
     */
    const waitMinutes = Math.max(1, Math.round((options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 60_000) - 1);
    args.push("--wait", "--wait-timeout", `${waitMinutes}m`, "--json");

    const { stdout, stderr } = await exec(args, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const combined = `${stdout}\n${stderr}`;

    if (looksUnauthenticated(combined)) {
      throw new Error("El CLI de Higgsfield no tiene sesión. Ejecuta «higgsfield auth login».");
    }

    // Se comprueba también aquí: el workspace puede haberse deseleccionado entre
    // la comprobación previa y la generación.
    if (needsWorkspace(combined)) {
      throw new Error(
        "Higgsfield no tiene workspace activo. Ejecuta «npx higgsfield workspace list» y luego «npx higgsfield workspace set <id>».",
      );
    }

    const urls = extractMediaUrls(stdout, kind);

    if (urls.length === 0) {
      throw new Error(
        `El CLI terminó sin devolver ningún ${kind === "video" ? "vídeo" : "imagen"}: ${combined.trim().slice(0, 300) || "sin salida"}`,
      );
    }

    return { imageUrls: urls, raw: stdout };
  } finally {
    if (workdir) await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}
