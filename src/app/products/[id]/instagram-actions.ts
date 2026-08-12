"use server";

import { revalidatePath } from "next/cache";
import { generateStructured } from "@/lib/generators";
import { INSTAGRAM_POSTS_SCHEMA } from "@/lib/generation-schemas";
import { findProductAnywhere } from "@/lib/products";
import { readProductResearch } from "@/lib/research-store";
import { addPosts, deletePost, updatePost } from "@/lib/data/instagram";
import { buildCaption, buildContentPrompt, findFormat } from "@/lib/instagram/content";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Escribe publicaciones y las deja en la cola, en borrador.
 *
 * La media no se genera aquí: cada pieza guarda **qué se ve**, y generarla es
 * otro paso y otro gasto. Escribir diez pies cuesta céntimos; diez vídeos, no —
 * y lo normal es descartar la mitad al leerlos.
 */
export async function generateInstagramAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const format = findFormat(readText(raw.format));
  const count = Math.min(Math.max(Number(raw.count) || 3, 1), 10);

  if (!productId) return { ok: false, message: "Falta el producto." };

  try {
    const product = await findProductAnywhere(productId);
    if (!product) return { ok: false, message: "Ese producto ya no existe." };

    const research = await readProductResearch(productId).catch(() => null);

    const context = [
      product.description ? `Producto: ${product.description}` : "",
      product.benefits.length > 0 ? `Beneficios: ${product.benefits.join(", ")}` : "",
      research?.master ? `Le duele: ${research.master.psychographics.painPoints.join("; ")}` : "",
      research?.master ? `Habla así: ${research.master.psychographics.languageToUse.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4_000);

    const written = await generateStructured<{
      posts: { first: string; body: string; scene: string; hashtags: string[] }[];
    }>({
      /*
       * El contexto va por el camino de la caché.
       *
       * Es lo mismo en todas las tandas de este producto, y pedir tres formatos
       * distintos son tres llamadas con el mismo principio.
       */
      context: context || undefined,
      prompt: buildContentPrompt({
        format,
        productName: product.name,
        audience: product.targetAudience || "el público objetivo",
        country: product.country || "México",
        count,
      }),
      schema: INSTAGRAM_POSTS_SCHEMA,
      role: "copy",
      maxTokens: 8_000,
    });

    const posts = (written.data.posts ?? [])
      .map((one) => ({
        format: format.id,
        // La primera línea y el cuerpo se juntan aquí, separados por un salto:
        // es lo que hace que el gancho quede solo delante del corte.
        caption: buildCaption({
          text: [one.first?.trim(), one.body?.trim()].filter(Boolean).join("\n\n"),
          hashtags: one.hashtags ?? [],
        }),
        hashtags: one.hashtags ?? [],
        scene: one.scene ?? "",
      }))
      .filter((one) => one.caption.trim());

    const saved = await addPosts(productId, posts);

    revalidatePath(`/products/${productId}`);

    return saved > 0
      ? { ok: true, message: `${saved} publicación(es) en borrador. Revísalas antes de programar.` }
      : { ok: false, message: "No devolvió ninguna publicación usable." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function updateInstagramPostAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await updatePost(readText(raw.id), {
      ...(raw.caption !== undefined ? { caption: readText(raw.caption) } : {}),
      ...(raw.scheduledAt !== undefined ? { scheduledAt: readText(raw.scheduledAt) || null } : {}),
      ...(raw.status !== undefined ? { status: readText(raw.status) } : {}),
    });

    revalidatePath(`/products/${readText(raw.productId)}`);

    return { ok: true, message: "Guardado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

export async function deleteInstagramPostAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  try {
    await deletePost(readText(raw.id));
    revalidatePath(`/products/${readText(raw.productId)}`);

    return { ok: true, message: "Borrada." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}

/**
 * Genera la imagen de **esa** publicación y la deja atada a ella.
 *
 * ## Por qué se guarda en la fila y no en la galería
 *
 * Porque una imagen suelta en el montón no dice a qué pie acompaña. Con dos
 * piezas se recuerda; con veinte no, y entonces hay que emparejarlas a mano
 * justo cuando toca publicar. Guardando la dirección en la fila, la pieza está
 * completa o no está.
 *
 * ## Y por qué usa la foto real del producto
 *
 * Porque sin ella el modelo se inventa el envase, y un envase inventado en la
 * cuenta de la marca es peor que no publicar: quien lo vea y luego reciba el
 * producto verá que no es el mismo.
 */
export async function generatePostMediaAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = readText(raw.id);
  const productId = readText(raw.productId);

  if (!id || !productId) return { ok: false, message: "Falta la publicación." };

  try {
    const { listPosts, updatePostMedia } = await import("@/lib/data/instagram");
    const post = (await listPosts(productId)).find((one) => one.id === id);

    if (!post) return { ok: false, message: "Esa publicación ya no existe." };
    if (!post.scene) return { ok: false, message: "Esta publicación no dice qué se ve." };

    const { findFormat } = await import("@/lib/instagram/content");
    const { generateWithCli, listCliModels } = await import("@/lib/higgsfield-cli");
    const { pickImageModel } = await import("@/lib/image-adapt");
    const { readPrimaryImage } = await import("@/lib/image-store");

    const model = pickImageModel((await listCliModels("image")).map((one) => one.slug));
    if (!model) {
      return {
        ok: false,
        message: "El CLI de Higgsfield no ofrece ningún modelo de imagen. Revisa la sesión en Estudio.",
      };
    }

    /*
     * La foto del producto va de referencia, si la hay.
     *
     * Sin ella se genera igual —una escena sin producto es válida en
     * Instagram—, pero se avisa: es la diferencia entre una foto de la marca y
     * una foto de archivo con un envase inventado.
     */
    const primary = await readPrimaryImage(productId).catch(() => null);
    const references: { filename: string; bytes: Uint8Array }[] = [];

    if (primary?.url) {
      const response = await fetch(primary.url, { cache: "no-store" }).catch(() => null);

      if (response?.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > 0) references.push({ filename: "producto.png", bytes });
      }
    }

    const generated = await generateWithCli({
      model,
      prompt: post.scene,
      aspectRatio: findFormat(post.format).aspectRatio,
      references,
    });

    const url = generated.imageUrls[0];
    if (!url) return { ok: false, message: "No devolvió ninguna imagen." };

    await updatePostMedia(id, url);
    revalidatePath(`/products/${productId}`);

    return {
      ok: true,
      message: references.length > 0 ? "Imagen lista." : "Imagen lista, pero sin la foto del producto: revisa el envase.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo." };
  }
}
