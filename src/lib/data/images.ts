import "server-only";
import { PRODUCT_IMAGE_PATTERN_META, type ProductImagePattern } from "@/types/visuals";

import { requireContext } from "@/lib/supabase/session";
import { toProductImage } from "@/lib/data/mappers";
import { buildAdImageName, siguienteSecuencia } from "@/lib/nombre-de-creatividad";
import type { Tables } from "@/types/database";
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

export async function listProductImages(
  productId: string,
  opciones: { incluirDescartadas?: boolean } = {},
): Promise<ProductImage[]> {
  const { supabase } = await requireContext();

  let pendiente = supabase.from("product_images").select("*").eq("product_id", productId);

  /*
   * Las descartadas fuera, y en el SQL.
   *
   * Filtrarlas después costaría además firmar la URL de cada una: la firma va en
   * una sola llamada para todas, así que traer descartes encarece la galería
   * entera para enseñar menos.
   */
  if (!opciones.incluirDescartadas) pendiente = pendiente.is("discarded_at", null);

  const { data, error } = await pendiente.order("created_at", { ascending: true });

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

/**
 * Cómo se llamará la creatividad de un anuncio, y qué lugar ocupa.
 *
 * Dos consultas y no una: el nombre del anuncio vive en `short_ads` y el máximo
 * en `product_images`. El máximo se pide con `order` + `limit 1`, que es como lo
 * pide el resto del proyecto (`nextNumbers`, en `campaigns.ts`).
 *
 * **Se cuentan también las descartadas**: un número entregado no vuelve a salir
 * aunque su imagen se haya escondido. Y hace falta el `not is null` porque en
 * Postgres los nulos van primero en un orden descendente.
 */
async function nombreParaAnuncio(
  supabase: Awaited<ReturnType<typeof requireContext>>["supabase"],
  adId: string,
): Promise<{ name: string; sequence: number } | null> {
  const [ad, ultima] = await Promise.all([
    supabase.from("short_ads").select("name").eq("id", adId).maybeSingle(),
    supabase
      .from("product_images")
      .select("ad_sequence")
      .eq("ad_id", adId)
      .not("ad_sequence", "is", null)
      .order("ad_sequence", { ascending: false })
      .limit(1),
  ]);

  // Sin anuncio no hay nombre que heredar. Puede pasar: `ad_id` es
  // `on delete set null`, así que una imagen sobrevive a su anuncio.
  if (!ad.data?.name) return null;

  const sequence = siguienteSecuencia(ultima.data?.[0]?.ad_sequence ?? null);
  return { name: buildAdImageName({ adName: ad.data.name, sequence }), sequence };
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
  /**
   * La imagen que ésta reemplaza, si viene de «Rehacer».
   *
   * Se descarta al final de esta función y no al pulsar el botón: la generación
   * va por la cola y puede fallar, y marcarla antes dejaría el anuncio sin
   * ninguna imagen visible.
   */
  replacesImageId?: string;
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

  /*
   * El nombre de una creatividad de anuncio no es negociable desde fuera: es lo
   * que se escribe en el gestor de anuncios. El `name` que llegue por parámetro
   * se ignora cuando hay `adId`.
   */
  let bautizo = input.adId ? await nombreParaAnuncio(supabase, input.adId) : null;

  /*
   * Dos intentos como mucho.
   *
   * El índice único `(ad_id, ad_sequence)` hace fallar con 23505 si otra pestaña
   * se llevó el mismo número entre la consulta del máximo y la inserción;
   * entonces se recalcula y se vuelve a probar. Sin el índice no fallaría nada:
   * se guardarían dos imágenes con el mismo nombre, que es el fallo que esto
   * viene a cerrar.
   */
  let data: Tables<"product_images"> | null = null;
  let error: { code?: string; message: string } | null = null;

  for (let intento = 0; intento < 2; intento += 1) {
    const respuesta = await supabase
      .from("product_images")
      .insert({
        user_id: userId,
        product_id: input.productId,
        market_id: imageMarket(input.pattern, input.marketId),
        pattern: input.pattern,
        name: bautizo?.name ?? input.name,
        ad_sequence: bautizo?.sequence ?? null,
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

    if (!respuesta.error) {
      data = respuesta.data;
      error = null;
      break;
    }

    error = respuesta.error;

    // Solo se reintenta el choque de correlativo. Cualquier otro error se
    // propaga tal cual: reintentarlo sería esconderlo.
    const chocoElCorrelativo = respuesta.error.code === "23505" && Boolean(input.adId);
    if (!chocoElCorrelativo || intento === 1) break;

    bautizo = await nombreParaAnuncio(supabase, input.adId as string);
  }

  if (error || !data) {
    // Sin fila, el archivo sería basura que nadie puede ver ni borrar.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`No se pudo registrar la imagen: ${error?.message ?? "sin fila"}`);
  }

  /*
   * La que ésta rehace se descarta **aquí**, con la nueva ya insertada.
   *
   * Marcarla al pulsar «Rehacer» dejaría el anuncio sin ninguna imagen visible
   * mientras se genera —que va por la cola y tarda— y sin ninguna para siempre
   * si la generación falla. Llegados aquí, la nueva existe.
   */
  if (input.replacesImageId) {
    const { error: discardError } = await supabase
      .from("product_images")
      .update({ discarded_at: new Date().toISOString() })
      .eq("id", input.replacesImageId);

    // No se relanza: la imagen nueva ya está guardada y perderla por no haber
    // podido esconder la vieja sería el peor de los dos resultados.
    if (discardError) {
      console.error(`No se pudo descartar la imagen anterior: ${discardError.message}`);
    }
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  return toProductImage(data, signed?.signedUrl ?? "");
}

/**
 * Esconde una imagen sin borrarla.
 *
 * Es lo que hace «Rehacer» con la anterior: deja de verse pero el archivo sigue,
 * por si la nueva sale peor. Borrar de verdad es otro botón —
 * `deleteProductImage`— y ese sí es definitivo.
 */
export async function discardProductImage(imageId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_images")
    .update({ discarded_at: new Date().toISOString() })
    .eq("id", imageId);

  if (error) throw new Error(`No se pudo descartar la imagen: ${error.message}`);
}

export async function restoreProductImage(imageId: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("product_images")
    .update({ discarded_at: null })
    .eq("id", imageId);

  if (error) throw new Error(`No se pudo recuperar la imagen: ${error.message}`);
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
