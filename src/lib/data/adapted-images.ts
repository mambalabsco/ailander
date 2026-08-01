import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { ImageReading } from "@/lib/image-adapt";

/** Imágenes de referencia rehechas con el producto propio. */

export interface AdaptedImage {
  id: string;
  productId: string;
  sourceUrl: string;
  width: number;
  height: number;
  aspectRatio: string;
  reading: ImageReading;
  prompt: string;
  resultUrl: string;
  warnings: string[];
  parentId: string | null;
  createdAt: string;
}

const EMPTY: ImageReading = {
  scene: "",
  text: "",
  textFits: true,
  textReason: "",
  suggestedText: "",
  brandNames: [],
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseReading(value: unknown): ImageReading {
  if (typeof value !== "object" || value === null) return EMPTY;
  const record = value as Record<string, unknown>;

  return {
    scene: text(record.scene),
    text: text(record.text),
    /*
     * Ante la duda, **no** vale.
     *
     * Un dato raro que se leyera como «vale» dejaría en la imagen una promesa
     * que el producto no sostiene, y eso acaba en devolución. Al revés solo
     * cuesta una reescritura de texto.
     */
    textFits: record.textFits === true,
    textReason: text(record.textReason),
    suggestedText: text(record.suggestedText),
    brandNames: Array.isArray(record.brandNames) ? record.brandNames.map(text).filter(Boolean) : [],
  };
}

export async function listAdaptedImages(productId: string): Promise<AdaptedImage[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("adapted_images")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las imágenes: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    sourceUrl: row.source_url,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspect_ratio,
    reading: parseReading(row.reading),
    prompt: row.prompt,
    resultUrl: row.result_url,
    warnings: Array.isArray(row.warnings) ? row.warnings.map(text).filter(Boolean) : [],
    parentId: row.parent_id,
    createdAt: row.created_at,
  }));
}

export async function findAdaptedImage(id: string): Promise<AdaptedImage | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("adapted_images").select("*").eq("id", id).maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    productId: data.product_id,
    sourceUrl: data.source_url,
    width: data.width,
    height: data.height,
    aspectRatio: data.aspect_ratio,
    reading: parseReading(data.reading),
    prompt: data.prompt,
    resultUrl: data.result_url,
    warnings: Array.isArray(data.warnings) ? data.warnings.map(text).filter(Boolean) : [],
    parentId: data.parent_id,
    createdAt: data.created_at,
  };
}

export async function saveAdaptedImage(input: {
  productId: string;
  sourceUrl: string;
  width: number;
  height: number;
  aspectRatio: string;
  reading: ImageReading;
  prompt: string;
  resultUrl: string;
  warnings: string[];
  parentId?: string | null;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("adapted_images")
    .insert({
      user_id: userId,
      product_id: input.productId,
      source_url: input.sourceUrl,
      width: input.width,
      height: input.height,
      aspect_ratio: input.aspectRatio,
      reading: input.reading,
      prompt: input.prompt,
      result_url: input.resultUrl,
      warnings: input.warnings,
      parent_id: input.parentId ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar la imagen: ${error.message}`);

  return data.id;
}

export async function deleteAdaptedImage(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("adapted_images").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}
