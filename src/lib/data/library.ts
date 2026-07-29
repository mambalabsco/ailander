import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { AdCampaign, AnalysisResult } from "@/types";
import type { Tables } from "@/types/database";

/**
 * Biblioteca de anuncios e historial de análisis.
 *
 * Las creatividades guardan la ruta en el bucket privado `ad-creatives`, igual
 * que las imágenes de producto: son material sin publicar, y una URL pública de
 * un anuncio que aún no ha salido acaba en registros de servidor y en
 * historiales de navegador.
 */

const BUCKET = "ad-creatives";
const SIGNED_URL_SECONDS = 3600;

function toAd(row: Tables<"ad_creatives">, signedUrl: string): AdCampaign {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    relatedProductId: row.product_id ?? "",
    type: row.kind,
    platform: row.platform,
    country: row.country,
    date: row.created_at.slice(0, 10),
    tags: row.tags,
    status: row.status as AdCampaign["status"],
    image: signedUrl,
  };
}

export async function listAds(): Promise<AdCampaign[]> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudo leer la biblioteca: ${error.message}`);

  const rows = data ?? [];
  const withFile = rows.filter((row) => row.storage_path);

  // Una sola llamada para firmar todas: una por anuncio sería una ida y vuelta
  // por miniatura y la galería tarda en aparecer.
  const urls = new Map<string, string>();
  if (withFile.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(withFile.map((row) => row.storage_path), SIGNED_URL_SECONDS);
    for (const item of signed ?? []) {
      // `path` viene nulo en las rutas que la firma no pudo resolver.
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }

  return rows.map((row) => toAd(row, urls.get(row.storage_path) ?? ""));
}

export async function saveAd(input: {
  id?: string;
  name: string;
  brand: string;
  relatedProductId?: string;
  type: AdCampaign["type"];
  platform: string;
  country: string;
  tags: string[];
  status: string;
  storagePath?: string;
}): Promise<AdCampaign> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.relatedProductId || null,
    name: input.name,
    brand: input.brand,
    kind: input.type,
    platform: input.platform,
    country: input.country,
    tags: input.tags,
    status: input.status,
    ...(input.storagePath ? { storage_path: input.storagePath } : {}),
  };

  const query = input.id
    ? supabase.from("ad_creatives").update(row).eq("id", input.id)
    : supabase.from("ad_creatives").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar el anuncio: ${error.message}`);

  let url = "";
  if (data.storage_path) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.storage_path, SIGNED_URL_SECONDS);
    url = signed?.signedUrl ?? "";
  }

  return toAd(data, url);
}

export async function deleteAd(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { data: row } = await supabase
    .from("ad_creatives")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error, count } = await supabase
    .from("ad_creatives")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo borrar el anuncio: ${error.message}`);

  // El archivo después de la fila: si falla, queda un archivo suelto
  // —recuperable— en vez de una fila que apunta a la nada.
  if (row?.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }

  return (count ?? 0) > 0;
}

/* ---------------------------------- Historial ----------------------------------- */

function toAnalysis(row: Tables<"analyses">): AnalysisResult {
  return {
    id: row.id,
    title: row.title,
    type: row.kind as AnalysisResult["type"],
    productId: row.product_id ?? "",
    productName: "",
    status: row.status as AnalysisResult["status"],
    createdAt: row.created_at.slice(0, 10),
    summary: row.summary,
  };
}

export async function listAnalyses(): Promise<AnalysisResult[]> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return (data ?? []).map(toAnalysis);
}

export async function saveAnalysis(input: {
  id?: string;
  title: string;
  type: AnalysisResult["type"];
  productId?: string;
  status: string;
  summary: string;
}): Promise<AnalysisResult> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId || null,
    title: input.title,
    kind: input.type,
    status: input.status,
    summary: input.summary,
  };

  const query = input.id
    ? supabase.from("analyses").update(row).eq("id", input.id)
    : supabase.from("analyses").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar el análisis: ${error.message}`);
  return toAnalysis(data);
}

export async function deleteAnalysis(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("analyses")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo borrar el análisis: ${error.message}`);
  return (count ?? 0) > 0;
}
