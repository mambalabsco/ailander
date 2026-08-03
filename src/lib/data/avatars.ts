import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Los avatares y sus tomas.
 *
 * Un avatar es una **cara suelta**, sin producto: se reutiliza en todos los
 * productos y en todas las tandas. Una toma es esa cara con un producto en un
 * contexto, y guarda con qué encargo se hizo para poder repetir la que salió
 * bien.
 */

export interface Avatar {
  id: string;
  name: string;
  url: string;
  description: string;
  source: string;
  createdAt: string;
  /** Cuántas tomas tiene ya, para verlo sin abrirlo. */
  shots: number;
}

export interface AvatarShot {
  id: string;
  avatarId: string;
  productId: string;
  url: string;
  context: string;
  prompt: string;
  createdAt: string;
}

export async function listAvatars(): Promise<Avatar[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("avatars")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los avatares: ${error.message}`);

  const avatars = data ?? [];
  if (avatars.length === 0) return [];

  const { data: shots } = await supabase
    .from("avatar_shots")
    .select("avatar_id")
    .in(
      "avatar_id",
      avatars.map((avatar) => avatar.id),
    );

  const counts = new Map<string, number>();
  for (const shot of shots ?? []) {
    counts.set(shot.avatar_id, (counts.get(shot.avatar_id) ?? 0) + 1);
  }

  return avatars.map((row) => ({
    id: row.id,
    name: row.name || "Sin nombre",
    url: row.url,
    description: row.description,
    source: row.source,
    createdAt: row.created_at,
    shots: counts.get(row.id) ?? 0,
  }));
}

export async function addAvatar(input: {
  name: string;
  url: string;
  description: string;
  source: string;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("avatars")
    .insert({
      user_id: userId,
      name: input.name,
      url: input.url,
      description: input.description,
      source: input.source,
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar el avatar: ${error.message}`);

  return data.id;
}

export async function updateAvatar(
  id: string,
  patch: { name?: string; description?: string },
): Promise<void> {
  const { supabase } = await requireContext();

  const changes: Record<string, unknown> = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.description !== undefined) changes.description = patch.description;

  if (Object.keys(changes).length === 0) return;

  const { error } = await supabase.from("avatars").update(changes as never).eq("id", id);
  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
}

/** Borra el avatar y, en cascada, sus tomas. */
export async function deleteAvatar(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("avatars").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

export async function readAvatar(id: string): Promise<Avatar | null> {
  return (await listAvatars()).find((avatar) => avatar.id === id) ?? null;
}

/* ---------------------------------- Tomas ---------------------------------- */

/**
 * Las tomas de un producto.
 *
 * Se piden por producto y no por avatar porque es como se miran: quien acaba de
 * lanzar una tanda quiere ver **las de este producto**, vengan de la cara que
 * vengan.
 */
export async function listShots(productId: string): Promise<AvatarShot[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("avatar_shots")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las tomas: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    avatarId: row.avatar_id,
    productId: row.product_id,
    url: row.url,
    context: row.context,
    prompt: row.prompt,
    createdAt: row.created_at,
  }));
}

export async function addShot(input: {
  avatarId: string;
  productId: string;
  url: string;
  context: string;
  prompt: string;
}): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("avatar_shots").insert({
    user_id: userId,
    avatar_id: input.avatarId,
    product_id: input.productId,
    url: input.url,
    context: input.context,
    prompt: input.prompt,
  });

  if (error) throw new Error(`No se pudo guardar la toma: ${error.message}`);
}

export async function deleteShot(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("avatar_shots").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

/* -------------------------------- Almacén ---------------------------------- */

/**
 * Sube una imagen al bucket y devuelve su dirección.
 *
 * El nombre lo pone el servidor. Uno de fuera puede traer barras y acabar
 * siendo una ruta dentro del bucket: dejarlo elegir es dejar escribir fuera de
 * su carpeta.
 */
export async function uploadAvatarImage(input: {
  data: Buffer;
  contentType: string;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const extension = input.contentType.split("/")[1] ?? "png";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("avatares")
    .upload(path, input.data, { contentType: input.contentType });

  if (error) throw new Error(`No se pudo subir: ${error.message}`);

  return supabase.storage.from("avatares").getPublicUrl(path).data.publicUrl;
}
