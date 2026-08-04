import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { VideoAnalysis, VideoBeat } from "@/lib/video/analysis";

/**
 * Los anuncios en vídeo analizados.
 *
 * Se guarda la construcción, no el vídeo ni su guion. Ver la cabecera de la
 * migración `20260731000400_video_references.sql`.
 */

export interface SavedVideoReference {
  id: string;
  name: string;
  sourceUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  hadAudio: boolean;
  framesAnalyzed: number;
  analysis: VideoAnalysis;
  warnings: string[];
  /**
   * Los fotogramas guardados, con el segundo del que salió cada uno.
   *
   * El vídeo sigue sin conservarse. Estos existen por el modo clonador: rehacer
   * una escena solo desde su descripción pierde justo lo que se quería copiar
   * —el encuadre, la luz, dónde cae el sujeto—, y con el fotograma delante la
   * escena nueva se genera con él de referencia.
   */
  frames: { url: string; at: number }[];
  createdAt: string;
}

const EMPTY: VideoAnalysis = {
  hook: "",
  promise: "",
  voice: "",
  beats: [],
  averageShotSeconds: 0,
  productMoment: "",
  callToAction: "",
  whyItWorks: "",
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Los momentos, validados uno a uno.
 *
 * Una columna `jsonb` puede traer cualquier cosa, y un momento sin segundo
 * rompería la línea de tiempo al enseñarla. Se descarta esa entrada y el resto
 * del análisis se lee: un análisis a medias sigue sirviendo para escribir.
 */
function parseBeats(value: unknown): VideoBeat[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const at = Number(record.at);
    if (!Number.isFinite(at)) return [];

    return [
      {
        at,
        shot: text(record.shot),
        role: text(record.role),
        onScreenText: text(record.onScreenText),
      },
    ];
  });
}

/** Los fotogramas, validados uno a uno como los momentos. */
function parseFrames(value: unknown): { url: string; at: number }[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const url = text(record.url);
    const at = Number(record.at);

    // Sin dirección no hay fotograma, y sin segundo no se puede emparejar con
    // ningún momento: las dos cosas o ninguna.
    return url && Number.isFinite(at) ? [{ url, at }] : [];
  });
}

function parseAnalysis(value: unknown): VideoAnalysis {
  if (typeof value !== "object" || value === null) return EMPTY;
  const record = value as Record<string, unknown>;

  const average = Number(record.averageShotSeconds);

  return {
    hook: text(record.hook),
    promise: text(record.promise),
    voice: text(record.voice),
    beats: parseBeats(record.beats),
    averageShotSeconds: Number.isFinite(average) ? average : 0,
    productMoment: text(record.productMoment),
    callToAction: text(record.callToAction),
    whyItWorks: text(record.whyItWorks),
  };
}

export async function listVideoReferences(): Promise<SavedVideoReference[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("video_references")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los anuncios analizados: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    // `numeric` llega como cadena desde PostgREST.
    durationSeconds: Number(row.duration_seconds),
    width: row.width,
    height: row.height,
    hadAudio: row.had_audio,
    framesAnalyzed: row.frames_analyzed,
    analysis: parseAnalysis(row.analysis),
    warnings: Array.isArray(row.warnings) ? row.warnings.map(text).filter(Boolean) : [],
    frames: parseFrames(row.frames),
    createdAt: row.created_at,
  }));
}

export async function saveVideoReference(input: {
  name: string;
  sourceUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  hadAudio: boolean;
  framesAnalyzed: number;
  analysis: VideoAnalysis;
  warnings: string[];
  frames?: { url: string; at: number }[];
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("video_references")
    .insert({
      user_id: userId,
      name: input.name,
      source_url: input.sourceUrl,
      duration_seconds: input.durationSeconds,
      width: input.width,
      height: input.height,
      had_audio: input.hadAudio,
      frames_analyzed: input.framesAnalyzed,
      analysis: input.analysis,
      warnings: input.warnings,
      frames: input.frames ?? [],
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar el análisis: ${error.message}`);

  return data.id;
}

export async function deleteVideoReference(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("video_references").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}
