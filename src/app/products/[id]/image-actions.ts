"use server";

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { uploadProductImages as uploadToStorage } from "@/lib/data/images";
import {
  addProductImage,
  deleteProductImage,
  readProductImages,
  setPrimaryImage,
} from "@/lib/image-store";
import { findProductAnywhere } from "@/lib/products";
import { buildImageName } from "@/types/visuals";
import type { ProductImage } from "@/types/visuals";

const uploadsDir = path.join(process.cwd(), "public", "uploads");

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadResult {
  uploaded: ProductImage[];
  errors: { fileName: string; reason: string }[];
}

/**
 * Sube una o varias imágenes de producto en la misma acción.
 *
 * Cada archivo se valida por separado: uno que falle no tumba la tanda, se
 * reporta y el resto continúa. La extensión la decide el servidor a partir del
 * tipo declarado, nunca el nombre que llega del cliente.
 */
export async function uploadProductImages(formData: FormData): Promise<UploadResult> {
  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) throw new Error("Falta el identificador del producto.");

  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) throw new Error("No se ha recibido ninguna imagen.");

  const product = await findProductAnywhere(productId);
  const existing = await readProductImages(productId);
  const makePrimary = formData.get("isPrimary") === "true" && existing.length === 0;

  /*
   * Con Supabase, el archivo va a un bucket privado y la fila a Postgres.
   *
   * La validación de tipo y tamaño se hace ahí dentro **y** en el propio bucket
   * (`allowed_mime_types` y `file_size_limit`): la del servidor da un mensaje
   * útil, la del bucket es la que no se puede saltar llamando a la API de
   * Storage directamente.
   */
  if (isSupabaseConfigured()) {
    const names = files.map((file, offset) =>
      buildImageName({
        productName: product?.name ?? "producto",
        pattern: "subida",
        index: existing.length + offset + 1,
      }),
    );

    const result = await uploadToStorage({
      productId,
      files,
      names,
      makeFirstPrimary: makePrimary,
    });

    revalidatePath(`/products/${productId}`);
    return {
      uploaded: result.uploaded,
      errors: result.errors.map((message) => ({ fileName: "", reason: message })),
    };
  }

  await fs.mkdir(uploadsDir, { recursive: true });

  const uploaded: ProductImage[] = [];
  const errors: UploadResult["errors"] = [];
  let index = existing.length;

  for (const file of files) {
    if (file.size === 0) continue;

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      errors.push({ fileName: file.name, reason: "Formato no admitido. Usa PNG, JPG, WEBP o GIF." });
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push({ fileName: file.name, reason: "Supera el máximo de 10 MB." });
      continue;
    }

    index += 1;
    const storedName = `${randomUUID()}${extension}`;
    await fs.writeFile(path.join(uploadsDir, storedName), Buffer.from(await file.arrayBuffer()));

    const image = await addProductImage({
      id: `img-${Date.now().toString(36)}-${index}`,
      productId,
      pattern: "subida",
      name: buildImageName({
        productName: product?.name ?? productId,
        pattern: "subida",
        index,
      }),
      url: `/uploads/${storedName}`,
      // Solo la primera de la tanda puede quedar como principal.
      isPrimary: makePrimary && uploaded.length === 0,
      source: "subida",
      createdAt: new Date().toISOString(),
    });

    uploaded.push(image);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");

  return { uploaded, errors };
}

export async function markPrimaryImage(productId: string, imageId: string) {
  const done = await setPrimaryImage(productId, imageId);
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return done;
}

export async function removeProductImage(productId: string, imageId: string) {
  const done = await deleteProductImage(productId, imageId);
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return done;
}

/**
 * Vuelve a importar las imágenes de la ficha de la tienda.
 *
 * **Existe por un fallo y se queda por útil.** `addProductImage` era la única
 * función de su módulo sin rama de Supabase, así que las imágenes de una ficha
 * importada se escribían en un archivo local que ya no lee nadie: el producto se
 * creaba sin ellas. Esto permite recuperarlas sin volver a crear el producto, y
 * también traer las que la tienda haya añadido después.
 *
 * Las que ya están no se repiten: se comparan por nombre.
 */
export async function reimportProductImagesAction(productId: unknown) {
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) throw new Error("Falta el producto.");

  const { findProductAnywhere } = await import("@/lib/products");
  const product = await findProductAnywhere(id);
  if (!product) throw new Error("No se encontró el producto.");

  if (!product.landingUrl) {
    throw new Error(
      "Este producto no tiene URL de ficha. Añádela en Editar producto para poder importar sus imágenes.",
    );
  }

  const { importFromProductUrl } = await import("@/lib/shopify-import");
  const imported = await importFromProductUrl(product.landingUrl);

  if (!imported.ok || !imported.product) {
    throw new Error(imported.reason ?? "No se pudo leer la ficha.");
  }

  const urls = imported.product.images ?? [];
  if (urls.length === 0) {
    return { ok: true, added: 0, message: "La ficha no publica imágenes en su JSON." };
  }

  const { readProductImages, addProductImage } = await import("@/lib/image-store");
  const existing = await readProductImages(id);
  const known = new Set(existing.map((image) => image.name));

  const { buildImageName } = await import("@/types/visuals");

  let added = 0;
  for (const [index, url] of urls.entries()) {
    const name = buildImageName({
      productName: product.name,
      pattern: "subida",
      index: index + 1,
    });

    if (known.has(name)) continue;

    await addProductImage({
      id: "",
      productId: id,
      pattern: "subida",
      name,
      url,
      // Solo si el producto todavía no tiene principal: la que hayas elegido a
      // mano manda sobre el orden de la ficha.
      isPrimary: existing.length === 0 && added === 0,
      source: "subida",
      createdAt: new Date().toISOString(),
    });

    added += 1;
  }

  revalidatePath(`/products/${id}`);

  return {
    ok: true,
    added,
    message: added > 0 ? `${added} imagen(es) importadas.` : "No había ninguna nueva.",
  };
}
