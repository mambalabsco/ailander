import { promises as fs } from "fs";
import path from "path";
import type { ProductImage } from "@/types/visuals";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as storage from "@/lib/data/images";

/**
 * Imágenes de producto.
 *
 * Con Supabase configurado, el archivo vive en un bucket **privado** y aquí solo
 * se guarda su ruta; la URL se firma al leer y caduca en una hora. Sin
 * configurar, sigue el modo local sobre `public/uploads`.
 */

const dataRoot = path.join(process.cwd(), "data");
const imagesPath = path.join(dataRoot, "product-images.json");

async function readAll(): Promise<ProductImage[]> {
  try {
    return JSON.parse(await fs.readFile(imagesPath, "utf8")) as ProductImage[];
  } catch {
    return [];
  }
}

async function writeAll(images: ProductImage[]) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(imagesPath, JSON.stringify(images, null, 2), "utf8");
}

/**
 * Las imágenes de un producto.
 *
 * **Aquí es donde se esconden las descartadas**, y no en cada llamador: por esta
 * función pasan las quince lecturas del proyecto —la galería, las landings, los
 * vídeos, los flujos y el generador—, así que filtrar en otro sitio dejaría al
 * siguiente que lea imágenes enseñando descartes sin enterarse.
 *
 * Las dos ramas filtran. Si solo lo hiciera la de Supabase, el respaldo local se
 * comportaría distinto y el fallo aparecería únicamente en la máquina sin
 * Supabase configurado, que es la peor forma de encontrarlo.
 */
export async function readProductImages(
  productId: string,
  opciones: { incluirDescartadas?: boolean } = {},
): Promise<ProductImage[]> {
  if (isSupabaseConfigured()) return storage.listProductImages(productId, opciones);
  const all = await readAll();
  return all.filter(
    (image) =>
      image.productId === productId && (opciones.incluirDescartadas || !image.discardedAt),
  );
}

/** La imagen que viaja como referencia a los anuncios. */
export async function readPrimaryImage(productId: string): Promise<ProductImage | null> {
  const images = await readProductImages(productId);
  return images.find((image) => image.isPrimary) ?? null;
}

export async function addProductImage(image: ProductImage): Promise<ProductImage> {
  /*
   * **Esta era la única función del módulo sin rama de Supabase**, y por eso las
   * imágenes de una ficha importada de Shopify no aparecían: se escribían en el
   * JSON local, que con Supabase configurado no lee nadie.
   *
   * La URL de origen es remota —el CDN de Shopify—, así que hay que descargarla
   * y subirla al bucket privado. Guardar solo el enlace haría depender la
   * galería de que esa tienda lo mantenga vivo.
   */
  if (isSupabaseConfigured()) {
    return storage.uploadGeneratedImage({
      productId: image.productId,
      sourceUrl: image.url,
      name: image.name,
      pattern: image.pattern,
      source: "subida",
      isPrimary: image.isPrimary,
    });
  }

  const all = await readAll();

  // Solo puede haber una principal por producto.
  const next = image.isPrimary
    ? all.map((item) =>
        item.productId === image.productId ? { ...item, isPrimary: false } : item,
      )
    : all;

  await writeAll([...next, image]);
  return image;
}

export async function setPrimaryImage(productId: string, imageId: string): Promise<boolean> {
  if (isSupabaseConfigured()) return storage.setPrimaryImage(productId, imageId);

  const all = await readAll();
  let found = false;

  const next = all.map((image) => {
    if (image.productId !== productId) return image;
    const isPrimary = image.id === imageId;
    if (isPrimary) found = true;
    return { ...image, isPrimary };
  });

  if (!found) return false;
  await writeAll(next);
  return true;
}

export async function deleteProductImage(productId: string, imageId: string): Promise<boolean> {
  if (isSupabaseConfigured()) return storage.deleteProductImage(imageId);

  const all = await readAll();
  const remaining = all.filter(
    (image) => !(image.productId === productId && image.id === imageId),
  );
  if (remaining.length === all.length) return false;
  await writeAll(remaining);
  return true;
}
