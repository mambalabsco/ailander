"use server";

import { revalidatePath } from "next/cache";
import { findProductAnywhere } from "@/lib/products";
import { readProductResearch } from "@/lib/research-store";
import { readPrimaryImage } from "@/lib/image-store";
import { buildProductContext } from "@/lib/copy-prompts";
import { generateStructured } from "@/lib/generators";
import { IMAGE_READING_SCHEMA } from "@/lib/generation-schemas";
import { hasActiveProviderKey } from "@/lib/provider-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runInBackground } from "@/lib/background";
import { requireContext } from "@/lib/supabase/session";
import { generateWithCli } from "@/lib/higgsfield-cli";
import {
  buildEditPrompt,
  buildReadingPrompt,
  imageMediaType,
  nearestRatio,
  readImageSize,
  reviewReading,
  type AdaptMode,
  type ImageReading,
} from "@/lib/image-adapt";
import {
  deleteAdaptedImage,
  findAdaptedImage,
  saveAdaptedImage,
} from "@/lib/data/adapted-images";
import type { LaunchResult } from "@/types/jobs";

/**
 * Rehacer imágenes ajenas con el producto propio.
 *
 * ## El recorrido de cada imagen
 *
 * Se descarga, se le lee el tamaño de los bytes, Claude mira qué se ve y **qué
 * dice el texto que lleva**, y con eso se le encarga a Nano Banana una imagen
 * nueva: misma escena, tu envase, el texto que valga conservado y el que no,
 * sustituido.
 *
 * ## Por qué el texto se lee antes de tocar nada
 *
 * Reescribirlo siempre tiraría lo que sirve —un sello de «sin azúcar» vale igual
 * para casi cualquier suplemento— y dejarlo siempre publicaría promesas que este
 * producto no sostiene. Se decide por trozos, y ante la duda no vale.
 *
 * ## El envase va por referencia
 *
 * Nunca descrito. Un envase escrito con palabras sale inventado, y un envase
 * inventado en una ficha de producto es una devolución: el cliente recibe algo
 * que no se parece a lo que vio.
 */

const MODEL = "nano-banana-pro";

/** Cuántas imágenes se adaptan de una tanda. */
const MAX_BATCH = 24;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** La foto principal del producto, en bytes, para mandarla de referencia. */
async function productReference(
  productId: string,
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const primary = await readPrimaryImage(productId);
  if (!primary?.url) return [];

  try {
    const response = await fetch(primary.url, { cache: "no-store" });
    if (!response.ok) return [];

    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 ? [{ filename: `${primary.name}.png`, bytes }] : [];
  } catch {
    return [];
  }
}

async function download(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

async function guard(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Esto se guarda en Supabase y todavía no está configurado.");
  }
  if (!(await hasActiveProviderKey())) {
    throw new Error("No hay clave de API configurada. Añádela en Configuración.");
  }
}

/* ----------------------------- Subir las tuyas ----------------------------- */

/** Lo que se acepta subir. Una foto de móvil entra de sobra. */
const ACCEPTED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Guarda las imágenes que se suben a mano.
 *
 * No todo lo que hay que rehacer sale de una tienda analizada: una foto del
 * móvil, un montaje de un proveedor, la captura de un anuncio que funcionó.
 *
 * Van a un bucket **público** por el mismo motivo que la voz de los vídeos: el
 * generador descarga el archivo por su cuenta y no se le puede pasar un buffer.
 * Una dirección firmada caducaría en mitad de una tanda larga y las últimas
 * fallarían sin motivo aparente.
 */
export async function uploadSourcesAction(
  form: FormData,
): Promise<{ ok: boolean; message: string; urls?: string[] }> {
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) return { ok: false, message: "No llegó ninguna imagen." };

  try {
    const { supabase, userId } = await requireContext();
    const urls: string[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const extension = ACCEPTED.get(file.type);

      if (!extension) {
        rejected.push(`${file.name} (no es jpg, png ni webp)`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push(`${file.name} (pasa de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
        continue;
      }

      /*
       * El nombre lo pone el servidor, no quien sube.
       *
       * Un nombre de archivo puede traer barras y puntos suspensivos, y acaba
       * siendo una ruta dentro del bucket: dejarlo elegir es dejar escribir
       * fuera de su carpeta. La extensión sale del tipo comprobado, no del
       * nombre.
       */
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage
        .from("adapt-sources")
        .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });

      if (error) {
        rejected.push(`${file.name} (${error.message})`);
        continue;
      }

      urls.push(supabase.storage.from("adapt-sources").getPublicUrl(path).data.publicUrl);
    }

    revalidatePath("/imagenes");

    return {
      ok: urls.length > 0,
      urls,
      message: [
        urls.length > 0 ? `${urls.length} imagen(es) subidas.` : "No se subió ninguna.",
        rejected.length > 0 ? ` Fuera: ${rejected.join("; ")}` : "",
      ].join(""),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo subir." };
  }
}

/** Las que se han subido, para poder elegirlas. */
export async function listSourcesAction(): Promise<{ url: string; name: string }[]> {
  try {
    const { supabase, userId } = await requireContext();

    const { data } = await supabase.storage
      .from("adapt-sources")
      .list(userId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

    return (data ?? [])
      .filter((item) => item.name && !item.name.startsWith("."))
      .map((item) => ({
        url: supabase.storage.from("adapt-sources").getPublicUrl(`${userId}/${item.name}`).data
          .publicUrl,
        name: item.name,
      }));
  } catch {
    return [];
  }
}

/* ------------------------------- La tanda ---------------------------------- */

export async function adaptImagesAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  if (!productId) throw new Error("Elige el producto que va a salir en las imágenes.");

  const urls = Array.isArray(raw.urls)
    ? [...new Set(raw.urls.map(readText).filter(Boolean))].slice(0, MAX_BATCH)
    : [];

  if (urls.length === 0) throw new Error("Elige al menos una imagen.");

  await guard();

  const product = await findProductAnywhere(productId);
  if (!product) throw new Error("No se encontró el producto.");

  const references = await productReference(productId);
  if (references.length === 0) {
    /*
     * Sin la foto del producto no se empieza.
     *
     * El modelo puede generar igualmente, pero se inventaría el envase — y una
     * tanda de veinte imágenes con un frasco inventado no se detecta hasta que
     * están todas hechas y pagadas.
     */
    throw new Error(
      "Ese producto no tiene imagen principal. Sube una y márcala como principal: es la que se manda de referencia para que el envase salga igual.",
    );
  }

  const research = await readProductResearch(productId);
  const context = buildProductContext(product, research, null);

  return runInBackground({
    productId,
    kind: "imagenes",
    label: `Adaptar ${urls.length} imagen(es) · ${product.name}`,
    revalidate: "/imagenes",
    resume: { productId, urls },
    work: async (report, cancelled) => {
      let done = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      const failures: string[] = [];
      let stopped = false;

      for (const [index, url] of urls.entries()) {
        // Entre imágenes y no en medio: la que está a medias ya está pagada.
        if (await cancelled()) {
          stopped = true;
          break;
        }

        await report(`Adaptando ${index + 1} de ${urls.length}`);

        try {
          const bytes = await download(url);
          if (!bytes) throw new Error("no se pudo descargar");

          /*
           * El tamaño sale de los bytes, no del atributo del HTML.
           *
           * Ese lo escribe quien hizo la página y a menudo miente o no está, y
           * la proporción es lo único que decide si la imagen generada encaja en
           * el hueco donde va.
           */
          const size = readImageSize(bytes) ?? { width: 0, height: 0 };
          const aspectRatio = nearestRatio(size.width, size.height);

          const reading = await generateStructured<ImageReading>({
            prompt: buildReadingPrompt(product.name, context),
            schema: IMAGE_READING_SCHEMA,
            role: "copy",
            maxTokens: 4_000,
            images: [
              {
                // Declarar un tipo a fijo hacía fallar el lote entero: el modelo
                // comprueba que coincida con los bytes, y las imágenes de tienda
                // suelen ser webp.
                mediaType: imageMediaType(bytes) ?? "image/jpeg",
                base64: Buffer.from(bytes).toString("base64"),
              },
            ],
          });

          inputTokens += reading.inputTokens;
          outputTokens += reading.outputTokens;

          const prompt = buildEditPrompt({ reading: reading.data, productName: product.name });

          const generated = await generateWithCli({
            model: MODEL,
            prompt,
            aspectRatio,
            // La de origen primero y la del producto después: el orden es el que
            // el modelo lee como «esta escena, con este producto».
            references: [{ filename: `origen-${index}.jpg`, bytes }, ...references],
          });

          const resultUrl = generated.imageUrls[0];
          if (!resultUrl) throw new Error("no devolvió ninguna imagen");

          await saveAdaptedImage({
            productId,
            sourceUrl: url,
            width: size.width,
            height: size.height,
            aspectRatio,
            reading: reading.data,
            prompt,
            resultUrl,
            warnings: reviewReading(reading.data),
          });

          done += 1;
        } catch (error) {
          // Una que falla no para la tanda: las demás siguen y al final se dice
          // cuáles no salieron, que es lo que permite reintentarlas sueltas.
          failures.push(`${url.split("/").pop()} (${error instanceof Error ? error.message : "falló"})`);
        }
      }

      return {
        summary: [
          stopped ? "Cancelado. " : "",
          `${done} de ${urls.length} imagen(es) adaptadas.`,
          failures.length > 0 ? ` No salieron: ${failures.join("; ")}` : "",
        ].join(""),
        inputTokens,
        outputTokens,
      };
    },
  });
}

/* ---------------------------- Otra pasada, suelta -------------------------- */

/**
 * Vuelve a pedir una imagen concreta.
 *
 * Dos modos, y la diferencia importa. **Desde cero** parte otra vez de la imagen
 * original: sirve cuando el resultado se fue por otro lado. **Mejorar** parte del
 * resultado anterior, que es lo que se quiere cuando casi está y solo falta un
 * detalle — empezar de cero ahí perdería lo que ya había salido bien.
 */
export async function regenerateImageAction(input: unknown): Promise<LaunchResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = readText(raw.id);
  const extra = readText(raw.extra);
  const mode: AdaptMode = readText(raw.mode) === "mejorar" ? "mejorar" : "nueva";

  if (!id) throw new Error("Falta la imagen.");
  await guard();

  const previous = await findAdaptedImage(id);
  if (!previous) throw new Error("Esa imagen ya no existe.");

  const product = await findProductAnywhere(previous.productId);
  if (!product) throw new Error("No se encontró el producto.");

  const references = await productReference(previous.productId);
  if (references.length === 0) {
    throw new Error("Ese producto ya no tiene imagen principal: sin ella el envase saldría inventado.");
  }

  return runInBackground({
    productId: previous.productId,
    kind: "imagenes",
    label: `${mode === "mejorar" ? "Mejorar" : "Rehacer"} imagen · ${product.name}`,
    revalidate: "/imagenes",
    resume: { id, extra, mode },
    work: async (report) => {
      await report(mode === "mejorar" ? "Mejorando la actual" : "Rehaciendo desde el original");

      // De dónde se parte: el original o lo último que salió.
      const from = mode === "mejorar" && previous.resultUrl ? previous.resultUrl : previous.sourceUrl;

      const bytes = await download(from);
      if (!bytes) throw new Error("No se pudo descargar la imagen de partida.");

      const prompt = buildEditPrompt({
        reading: previous.reading,
        productName: product.name,
        extra,
        mode,
      });

      const generated = await generateWithCli({
        model: MODEL,
        prompt,
        aspectRatio: previous.aspectRatio,
        references: [{ filename: "partida.jpg", bytes }, ...references],
      });

      const resultUrl = generated.imageUrls[0];
      if (!resultUrl) throw new Error("No devolvió ninguna imagen.");

      await saveAdaptedImage({
        productId: previous.productId,
        sourceUrl: previous.sourceUrl,
        width: previous.width,
        height: previous.height,
        aspectRatio: previous.aspectRatio,
        reading: previous.reading,
        prompt,
        resultUrl,
        warnings: reviewReading(previous.reading),
        parentId: previous.id,
      });

      return { summary: "Lista. La anterior se conserva por si era mejor." };
    },
  });
}

export async function deleteAdaptedImageAction(id: unknown): Promise<void> {
  const imageId = readText(id);
  if (!imageId) return;

  await deleteAdaptedImage(imageId);
  revalidatePath("/imagenes");
}
