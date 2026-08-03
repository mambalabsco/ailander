import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { Shot, ShotRole } from "@/lib/video/shots";
import type { TimedWord } from "@/lib/video/words";
import type { TablesUpdate } from "@/types/database";

/**
 * Vídeos y sus tomas.
 *
 * Cada toma avanza por su cuenta —una puede tener el keyframe listo y el clip
 * fallado mientras la de al lado va entera—, así que se actualizan de una en una
 * y nunca reescribiendo el vídeo completo. Con las tomas dentro de un `jsonb`
 * dos generaciones en paralelo se pisarían la última en escribir.
 */

export type VideoStatus = "borrador" | "voz" | "keyframes" | "clips" | "montado" | "error";

export interface VideoShot extends Shot {
  id: string;
  position: number;
  cutStart: number | null;
  cutEnd: number | null;
  keyframeUrl: string | null;
  clipUrl: string | null;
  lipsyncUrl: string | null;
  error: string | null;
}

export interface Video {
  id: string;
  productId: string;
  copyId: string | null;
  title: string;
  status: VideoStatus;
  styleRender: string;
  styleAccent: string;
  voiceId: string;
  voiceUrl: string | null;
  /** Música de fondo, ya baja de volumen. Vacío si no lleva. */
  musicUrl: string;
  /** Con qué modelo se anima. Ver `VIDEO_MODELS`. */
  videoModel: string;
  /** Cuándo se tocó por última vez. Delata un montaje nuevo con la misma URL. */
  updatedAt: string;
  words: TimedWord[];
  voiceSeconds: number;
  finalUrl: string | null;
  thumbnailUrl: string | null;
  spentUsd: number;
  shots: VideoShot[];
  createdAt: string;
}

const num = (value: string | null): number => {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Las palabras vienen de una columna `jsonb`, así que pueden ser cualquier cosa.
 *
 * Se validan en vez de confiar: una palabra con tiempo no numérico produce un
 * corte `NaN`, y un `NaN` recorre todo el montaje sin dar ningún error hasta que
 * el vídeo sale mal.
 */
function parseWords(value: unknown): TimedWord[] {
  if (!Array.isArray(value)) return [];

  const words: TimedWord[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;

    const start = Number(record.start);
    const end = Number(record.end);
    if (typeof record.word !== "string" || !Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }

    words.push({ word: record.word, start, end });
  }

  return words;
}

export async function listVideos(productId: string): Promise<Video[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los vídeos: ${error.message}`);

  const videos = data ?? [];
  if (videos.length === 0) return [];

  const { data: shots } = await supabase
    .from("video_shots")
    .select("*")
    .in(
      "video_id",
      videos.map((video) => video.id),
    )
    .order("position", { ascending: true });

  return videos.map((row) => ({
    id: row.id,
    productId: row.product_id,
    copyId: row.copy_id,
    title: row.title,
    status: row.status as VideoStatus,
    styleRender: row.style_render,
    styleAccent: row.style_accent,
    voiceId: row.voice_id,
    voiceUrl: row.voice_url,
    musicUrl: row.music_url ?? "",
    videoModel: row.video_model ?? "grok",
    updatedAt: row.updated_at,
    words: parseWords(row.words),
    voiceSeconds: num(row.voice_seconds),
    finalUrl: row.final_url,
    thumbnailUrl: row.thumbnail_url,
    spentUsd: num(row.spent_usd),
    createdAt: row.created_at,
    shots: (shots ?? [])
      .filter((shot) => shot.video_id === row.id)
      .map((shot) => ({
        id: shot.id,
        n: shot.n,
        position: shot.position,
        guion: shot.guion,
        sub: shot.sub ?? undefined,
        role: shot.role as ShotRole,
        scene: shot.scene,
        motion: shot.motion,
        speaking: shot.speaking,
        cutStart: shot.cut_start === null ? null : num(shot.cut_start),
        cutEnd: shot.cut_end === null ? null : num(shot.cut_end),
        keyframeUrl: shot.keyframe_url,
        clipUrl: shot.clip_url,
        lipsyncUrl: shot.lipsync_url,
        error: shot.error,
      })),
  }));
}

export async function readVideo(id: string): Promise<Video | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase.from("videos").select("product_id").eq("id", id).maybeSingle();
  if (!data) return null;

  const videos = await listVideos(data.product_id);
  return videos.find((video) => video.id === id) ?? null;
}

export async function createVideo(input: {
  productId: string;
  copyId?: string;
  videoModel?: string;
  title: string;
  styleRender: string;
  styleAccent: string;
  voiceId: string;
  shots: Shot[];
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("videos")
    .insert({
      user_id: userId,
      product_id: input.productId,
      copy_id: input.copyId ?? null,
      video_model: input.videoModel ?? "grok",
      title: input.title,
      style_render: input.styleRender,
      style_accent: input.styleAccent,
      voice_id: input.voiceId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo crear el vídeo: ${error.message}`);

  await replaceShots(data.id, input.shots);
  return data.id;
}

/**
 * Reescribe las tomas de un vídeo.
 *
 * Borra y vuelve a insertar en vez de conciliar. Las tomas no tienen clave
 * natural estable —renumerar al partir una toma larga cambia los identificadores
 * de todas las siguientes— y conciliar dejaría vivas las que desaparecieron.
 *
 * Es destructivo con lo generado, así que solo se usa al crear o al reescribir
 * el guion a propósito; los avances de cada toma van por `updateShot`.
 */
export async function replaceShots(videoId: string, shots: Shot[]): Promise<void> {
  const { supabase } = await requireContext();

  await supabase.from("video_shots").delete().eq("video_id", videoId);

  if (shots.length === 0) return;

  const { error } = await supabase.from("video_shots").insert(
    shots.map((shot, index) => ({
      video_id: videoId,
      n: shot.n,
      position: index,
      guion: shot.guion,
      sub: shot.sub ?? null,
      role: shot.role,
      scene: shot.scene,
      motion: shot.motion,
      speaking: shot.speaking,
    })),
  );

  if (error) throw new Error(`No se pudieron guardar las tomas: ${error.message}`);
}

/** Avance de una toma. Solo toca lo que llega, para no pisar lo que va en paralelo. */
export async function updateShot(
  shotId: string,
  patch: {
    /** Su número, que es su posición. Solo se toca al reparar uno repetido. */
    n?: string;
    cutStart?: number | null;
    cutEnd?: number | null;
    keyframeUrl?: string | null;
    clipUrl?: string | null;
    lipsyncUrl?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const { supabase } = await requireContext();

  // Tipado con la fila y no con `Record`: una columna mal escrita la caza el
  // compilador en vez de acabar en un `update` que Postgres rechaza en marcha.
  const changes: TablesUpdate<"video_shots"> = {};
  if (patch.n !== undefined) changes.n = patch.n;
  if (patch.cutStart !== undefined) changes.cut_start = patch.cutStart?.toString() ?? null;
  if (patch.cutEnd !== undefined) changes.cut_end = patch.cutEnd?.toString() ?? null;
  if (patch.keyframeUrl !== undefined) changes.keyframe_url = patch.keyframeUrl;
  if (patch.clipUrl !== undefined) changes.clip_url = patch.clipUrl;
  if (patch.lipsyncUrl !== undefined) changes.lipsync_url = patch.lipsyncUrl;
  if (patch.error !== undefined) changes.error = patch.error;

  if (Object.keys(changes).length === 0) return;

  const { error } = await supabase.from("video_shots").update(changes).eq("id", shotId);
  if (error) throw new Error(`No se pudo actualizar la toma: ${error.message}`);
}

export async function updateVideo(
  id: string,
  patch: {
    status?: VideoStatus;
    voiceUrl?: string | null;
    musicUrl?: string;
    words?: TimedWord[];
    voiceSeconds?: number;
    finalUrl?: string | null;
    thumbnailUrl?: string | null;
    voiceId?: string;
    /** Se **suma** a lo ya gastado, no lo reemplaza. */
    addSpent?: number;
  },
): Promise<void> {
  const { supabase } = await requireContext();

  const changes: TablesUpdate<"videos"> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) changes.status = patch.status;
  if (patch.voiceUrl !== undefined) changes.voice_url = patch.voiceUrl;
  if (patch.musicUrl !== undefined) changes.music_url = patch.musicUrl;
  if (patch.words !== undefined) changes.words = patch.words as unknown as TablesUpdate<"videos">["words"];
  if (patch.voiceSeconds !== undefined) changes.voice_seconds = patch.voiceSeconds.toFixed(2);
  if (patch.finalUrl !== undefined) changes.final_url = patch.finalUrl;
  if (patch.thumbnailUrl !== undefined) changes.thumbnail_url = patch.thumbnailUrl;
  if (patch.voiceId !== undefined) changes.voice_id = patch.voiceId;

  /*
   * El gasto se acumula leyendo primero.
   *
   * No es atómico y es aceptable: los pasos de un vídeo van en serie dentro del
   * mismo trabajo, así que no hay dos escrituras a la vez. Si algún día se
   * paralelizan, esto necesita un `rpc` que sume en la base de datos.
   */
  if (patch.addSpent) {
    const { data } = await supabase.from("videos").select("spent_usd").eq("id", id).maybeSingle();
    changes.spent_usd = (num(data?.spent_usd ?? "0") + patch.addSpent).toFixed(4);
  }

  const { error } = await supabase.from("videos").update(changes).eq("id", id);
  if (error) throw new Error(`No se pudo actualizar el vídeo: ${error.message}`);
}

export async function deleteVideo(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar el vídeo: ${error.message}`);
}
