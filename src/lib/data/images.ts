import "server-only";
import { PRODUCT_IMAGE_PATTERN_META, type ProductImagePattern } from "@/types/visuals";

import { requireContext } from "@/lib/supabase/session";
import { toProductImage } from "@/lib/data/mappers";
import type { ProductImage } from "@/types/visuals";

/**
 * Imágenes de producto: fila en Postgres, archivo en Storage.
 *
 * En la base de datos solo vive la ruta. El archivo está en un bucket privado,
 * así que para pintarlo hay que firmar una URL temporal — no se puede enlazar
 * directamente, que es justo lo que se quería evitar: una URL pública de una
 * creatividad sin publicar acaba en registros de servidor y en historiales.
 */

const BUCKET = "product-images";

/** Una hora: suficiente para ver la página y corto para que no circule. */
const SIGNED_URL_SECONDS = 3600;

/**
 * Validación de subida.
 *
 * Se repite en el bucket (`allowed_mime_types` y `file_size_limit`), y esa es
 * la que de verdad no se puede saltar. Esta existe para dar un mensaje de error
 * útil antes de gastar el ancho de banda de la subida.
 */
/*
 * También lo que se mueve.
 *
 * Un hueco de una landing puede llevar un bucle corto en vez de una foto, y en
 * las páginas que venden eso retiene más. `webm` va el primero porque pesa una
 * fracción de un GIF con la misma calidad, y en una landing el peso es tiempo de
 * carga sobre alguien que está decidiendo si se queda.
 *
 * El GIF entra porque es lo que sale de la mitad de las herramientas, y el mp4
 * porque es lo que devuelven los generadores de vídeo.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/webm",
  "video/mp4",
];
/*
 * Veinte megas, no diez.
 *
 * Un bucle de tres segundos en webm cabe de sobra; en GIF, no siempre — y el GIF
 * se admite porque es lo que sale de muchas herramientas, no porque sea buena
 * idea. Rechazarlo por tamaño obligaría a convertirlo antes de subirlo.
 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `«${file.name}»: formato no admitido. Usa PNG, JPG, WebP, AVIF, GIF, WEBM o MP4.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `«${file.name}»: pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son 10 MB.`;
  }
  if (file.size === 0) {
    return `«${file.name}»: el archivo está vacío.`;
  }
  return null;
}

/** Extensión a partir del tipo, para no fiarse del nombre que manda el navegador. */
function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return map[mimeType] ?? "bin";
}

/**
 * Ruta dentro del bucket.
 *
 * El id del usuario va **primero** porque la política de Storage compara el
 * primer segmento con `auth.uid()`. Si fuera segundo, cualquiera podría escapar
 * de su carpeta inventándose el primero.
 */
function storagePath(userId: string, productId: string, name: string, mimeType: string): string {
  const safe = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${userId}/${productId}/${safe || "imagen"}-${crypto.randomUUID().slice(0, 8)}.${extensionFor(mimeType)}`;
}

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las imágenes: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Una sola llamada para firmar todas: una por imagen sería una ida y vuelta
  // por miniatura y la galería tarda en aparecer.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((row) => row.storage_path), SIGNED_URL_SECONDS);

  if (signError) throw new Error(`No se pudieron firmar las imágenes: ${signError.message}`);

  const urls = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
  return rows.map((row) => toProductImage(row, urls.get(row.storage_path) ?? ""));
}

export async function uploadProductImages(input: {
  productId: string;
  files: File[];
  /** Nombre legible, el que se citará en el anuncio. */
  names: string[];
  makeFirstPrimary: boolean;
  /** De qué app son, en casino. Nulo en todo lo demás. */
  appId?: string;
  /**
   * Qué son.
   *
   * `captura-app` es la pantalla que viaja de referencia al generar: es lo que
   * hace que el teléfono de la creatividad enseñe **esa** app y no una parecida.
   */
  pattern?: string;
}): Promise<{ uploaded: ProductImage[]; errors: string[] }> {
  const { supabase, userId } = await requireContext();

  const errors: string[] = [];
  const paths: { path: string; name: string; file: File }[] = [];

  for (const [index, file] of input.files.entries()) {
    const problem = validateImageFile(file);
    if (problem) {
      errors.push(problem);
      continue;
    }
    const name = input.names[index] || file.name.replace(/\.[^.]+$/, "");
    paths.push({ path: storagePath(userId, input.productId, name, file.type), name, file });
  }

  const uploaded: ProductImage[] = [];

  for (const [index, item] of paths.entries()) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(item.path, item.file, { contentType: item.file.type, upsert: false });

    if (uploadError) {
      errors.push(`«${item.name}»: ${uploadError.message}`);
      continue;
    }

    const isPrimary = input.makeFirstPrimary && index === 0;
    if (isPrimary) {
      // El índice único solo admite una principal, así que se libera antes.
      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", input.productId);
    }

    const { data, error } = await supabase
      .from("product_images")
      .insert({
        app_id: input.appId ?? null,
        user_id: userId,
        product_id: input.productId,
        pattern: input.pattern || "subida",
        name: item.name,
        storage_path: item.path,
        storage_bucket: BUCKET,
        mime_type: item.file.type,
        size_bytes: item.file.size,
        is_primary: isPrimary,
        source: "subida",
      })
      .select("*")
      .single();

    if (error) {
      // La fila no se guardó: el archivo suelto en Storage sería basura que
      // nadie puede ver ni borrar desde la interfaz.
      await supabase.storage.from(BUCKET).remove([item.path]);
      errors.push(`«${item.name}»: ${error.message}`);
      continue;
    }

    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(item.path, SIGNED_URL_SECONDS);

    uploaded.push(toProductImage(data, signed?.signedUrl ?? ""));
  }

  return { uploaded, errors };
}

/**
 * Descarga una imagen generada y la sube al bucket.
 *
 * Higgsfield la sirve desde su CDN; guardar solo ese enlace haría que la
 * galería dependiera de que ese archivo siga vivo. Al copiarla, la imagen pasa
 * a ser tuya y se sirve con URL firmada como todas las demás.
 */
/**
 * Con qué mercado se sella una imagen generada.
 *
 * Con texto dentro, con el suyo: está en un idioma y no vale en otro país. Sin
 * texto, general — un packshot es el mismo en todas partes, y marcarlo lo
 * escondería de los demás mercados sin ninguna razón.
 */
function imageMarket(pattern: string, marketId: string | null | undefined): string | null {
  const meta = PRODUCT_IMAGE_PATTERN_META[pattern as ProductImagePattern];
  // Sin metadatos conocidos se asume que lleva texto, que es el lado seguro:
  // esconderla de más se corrige con un clic; publicarla en el idioma
  // equivocado, no.
  return (meta?.hasText ?? true) ? (marketId ?? null) : null;
}

export async function uploadGeneratedImage(input: {
  /**
   * El mercado en el que se generó. Nulo es general.
   *
   * Solo se usa cuando la imagen lleva texto: las que no, valen en todos los
   * mercados y sellarlas con un país las escondería del resto sin motivo.
   */
  marketId?: string | null;
  productId: string;
  sourceUrl: string;
  name: string;
  pattern: string;
  prompt?: string;
  modelId?: string;
  /**
   * De dónde viene.
   *
   * Las importadas de la ficha de Shopify son `subida`, no `generada`: no las
   * hizo ningún modelo y marcarlas como generadas falsearía el historial.
   */
  source?: "subida" | "generada";
  /** La primera de una importación es la principal, que es la que se usa de referencia. */
  isPrimary?: boolean;
  /** De qué copy salió, para poder enseñarla dentro de su anuncio. */
  copyId?: string;
  /** De qué app es, en casino. La captura es la que viaja de referencia. */
  appId?: string;
  /** De qué anuncio corto salió. */
  adId?: string;
  /** De qué página salió. */
  landingId?: string;
  concept?: string;
  originLabel?: string;
}): Promise<ProductImage> {
  const { supabase, userId } = await requireContext();

  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen generada (${response.status}).`);
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    throw new Error(`La imagen generada llegó como ${contentType || "tipo desconocido"}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("La imagen generada supera los 10 MB del bucket.");
  }

  const path = storagePath(userId, input.productId, input.name, contentType);

  // El índice único solo admite una principal por producto, así que se libera
  // antes de insertar la nueva.
  if (input.isPrimary) {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", input.productId);
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (uploadError) throw new Error(`No se pudo guardar la imagen: ${uploadError.message}`);

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      user_id: userId,
      product_id: input.productId,
      market_id: imageMarket(input.pattern, input.marketId),
      pattern: input.pattern,
      name: input.name,
      storage_path: path,
      storage_bucket: BUCKET,
      mime_type: contentType,
      size_bytes: bytes.byteLength,
      // Vacío, no nulo: las columnas son NOT NULL y una imagen subida
      // sencillamente no tiene prompt ni modelo.
      prompt: input.prompt ?? "",
      model_id: input.modelId ?? "",
      is_primary: input.isPrimary ?? false,
      source: input.source ?? "generada",
      copy_id: input.copyId ?? null,
      ad_id: input.adId ?? null,
      landing_id: input.landingId ?? null,
      concept: input.concept ?? null,
      origin_label: input.originLabel ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // Sin fila, el archivo sería basura que nadie puede ver ni borrar.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`No se pudo registrar la imagen: ${error.message}`);
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  return toProductImage(data, signed?.signedUrl ?? "");
}

export async function setPrimaryImage(productId: string, imageId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error: clearError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId);

  if (clearError) throw new Error(`No se pudo cambiar la principal: ${clearError.message}`);

  const { error, count } = await supabase
    .from("product_images")
    .update({ is_primary: true }, { count: "exact" })
    .eq("id", imageId);

  if (error) throw new Error(`No se pudo marcar la principal: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function deleteProductImage(imageId: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { data: row, error: readError } = await supabase
    .from("product_images")
    .select("storage_path")
    .eq("id", imageId)
    .maybeSingle();

  if (readError) throw new Error(`No se pudo leer la imagen: ${readError.message}`);
  if (!row) return false;

  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw new Error(`No se pudo borrar la imagen: ${error.message}`);

  // El archivo se borra después de la fila: si fallara este paso, queda un
  // archivo huérfano —recuperable— en vez de una fila que apunta a la nada.
  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  return true;
}
