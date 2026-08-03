import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Las músicas guardadas de un vídeo.
 *
 * Se acumulan en vez de pisarse. Cada una cuesta —y con el generador bueno
 * cuesta de verdad— así que tirar la anterior por generar otra convierte cada
 * intento en dinero perdido. Aquí se quedan todas y se elige; borrar es una
 * decisión aparte.
 */

export interface MusicTrack {
  id: string;
  url: string;
  model: string;
  prompt: string;
  lufs: number;
  seconds: number;
  createdAt: string;
}

const num = (value: string | null): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function listMusic(videoId: string): Promise<MusicTrack[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("video_music")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las músicas: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    model: row.model,
    prompt: row.prompt,
    lufs: num(row.lufs),
    seconds: num(row.seconds),
    createdAt: row.created_at,
  }));
}

export async function addMusic(input: {
  videoId: string;
  url: string;
  model: string;
  prompt: string;
  lufs: number;
  seconds: number;
}): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("video_music").insert({
    user_id: userId,
    video_id: input.videoId,
    url: input.url,
    model: input.model,
    prompt: input.prompt,
    lufs: input.lufs.toFixed(1),
    seconds: input.seconds.toFixed(2),
  });

  if (error) throw new Error(`No se pudo guardar la música: ${error.message}`);
}

export async function deleteMusic(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("video_music").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

export async function deleteAllMusic(videoId: string): Promise<number> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("video_music")
    .delete()
    .eq("video_id", videoId)
    .select("id");

  if (error) throw new Error(`No se pudieron borrar: ${error.message}`);

  return (data ?? []).length;
}
