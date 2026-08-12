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
