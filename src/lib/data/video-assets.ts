import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * La voz de un vídeo, en almacenamiento.
 *
 * Hace falta guardarla en un sitio con URL pública porque el servicio de montaje
 * la descarga por su cuenta: no se le puede pasar un buffer. Y el bucket de
 * imágenes no sirve porque es privado con URL firmada de una hora, y el montaje
 * puede tardar más que eso si hay cola.
 */

const BUCKET = "video-assets";

export async function uploadVideoAsset(options: {
  videoId: string;
  name: string;
  data: Buffer;
  contentType: string;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  // La ruta lleva el usuario delante: es lo que hacen cumplir las políticas del
  // bucket, igual que en el de imágenes.
  const path = `${userId}/${options.videoId}/${options.name}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, options.data, { contentType: options.contentType, upsert: true });

  if (error) throw new Error(`No se pudo guardar el audio: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
