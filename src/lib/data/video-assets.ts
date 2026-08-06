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

/**
 * Lo que admite el bucket. Ver `20260805000600_video_assets_192`.
 *
 * Tiene que ir **igual** que el límite del bucket. Si aquí fuera más alto, la
 * comprobación pasaría y el almacenamiento rechazaría el archivo con un mensaje
 * que no dice ni cuánto pesaba ni cuál era el tope.
 */
const MAX_MB = 192;

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

  /*
   * El tamaño se mira **antes** de subirlo.
   *
   * El almacenamiento contesta «The object exceeded the maximum allowed size»,
   * que no dice ni cuánto pesaba ni cuál era el tope — y llega después de haber
   * generado y pagado la música. Comprobarlo aquí cuesta nada y el mensaje se
   * puede leer.
   */
  const megas = options.data.byteLength / (1024 * 1024);

  if (megas > MAX_MB) {
    /*
     * El mensaje tiene que servir para lo que de verdad se puede hacer.
     *
     * El anterior decía «súbela en MP3», y la música **la genera la
     * plataforma**: no hay ningún sitio donde subir nada. Se leía como que el
     * fallo era tuyo por no haber hecho algo que no existía.
     *
     * Lo que sí se puede hacer es pedir menos segundos o cambiar de generador,
     * porque los que devuelven WAV son los que llenan esto.
     */
    throw new Error(
      `El audio pesa ${megas.toFixed(1)} MB y el tope son ${MAX_MB}. Los generadores devuelven WAV sin comprimir, así que las pistas muy largas pesan mucho: pide menos segundos, o usa ElevenLabs Music, que entrega MP3 y ocupa unas diez veces menos.`,
    );
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, options.data, { contentType: options.contentType, upsert: true });

  if (error) {
    /*
     * El almacenamiento rechazando por tamaño después de que la comprobación de
     * arriba lo dejara pasar solo significa una cosa: el tope del bucket es
     * menor que `MAX_MB`, o sea que falta aplicar la migración que lo sube.
     *
     * Su mensaje —«The object exceeded the maximum allowed size»— no dice ni
     * cuánto pesaba, ni cuál es el tope, ni que lo que falta es una migración.
     * Con eso delante, lo que parece es que el arreglo no funcionó.
     */
    if (/exceeded the maximum allowed size/i.test(error.message)) {
      /*
       * Hay **dos** topes, y manda el más pequeño.
       *
       * El del bucket, que se sube por migración, y uno **global del proyecto**
       * que está en los ajustes de Storage y limita todos los buckets a la vez.
       * Un bucket a 192 MB con el global en 50 rechaza a los 50, y el mensaje
       * de Supabase no dice cuál de los dos saltó.
       *
       * Este mensaje llegó a acusar solo a la migración, y eso mandó a mirar
       * —y a aplicar— algo que ya estaba bien. Un error que señala el sitio
       * equivocado cuesta más que uno que no señala ninguno.
       */
      throw new Error(
        `El almacenamiento rechazó ${megas.toFixed(1)} MB. Hay dos topes y manda el más bajo: el del bucket «${BUCKET}» (que la migración «20260805000600_video_assets_192» deja en ${MAX_MB} MB) y el **global del proyecto**, en Supabase → Storage → Settings → «Upload file size limit», que en el plan gratuito son 50 MB como máximo. Si el bucket ya está bien, el que sobra es el global.`,
      );
    }

    throw new Error(`No se pudo guardar el audio: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
