/**
 * Convertir el hueco de una imagen en un hueco de **vídeo en bucle**.
 *
 * ## Para qué
 *
 * En una landing, un vídeo corto que se repite solo —sin controles, sin sonido—
 * retiene más que una foto y no distrae como un vídeo con play. Es lo que hacen
 * las páginas que venden: el producto moviéndose dos segundos, en bucle.
 *
 * ## Por qué el prompt es distinto y no el mismo con «en movimiento»
 *
 * Porque un encargo de foto describe **un instante** y uno de vídeo describe
 * **qué cambia**. Pidiendo movimiento sobre una descripción de foto, el
 * generador mueve la cámara sobre una escena quieta: sale un travelling sobre
 * un bodegón, que es exactamente lo que delata que fue una foto.
 *
 * Y en bucle hay una condición más que casi nadie escribe: **tiene que acabar
 * donde empieza**. Sin eso, cada vuelta da un salto, y el salto se nota más que
 * el movimiento.
 */

export const LOOP_SECONDS: [number, number] = [2, 4];

export function buildMotionPrompt(input: {
  /** Qué se ve, tal y como estaba escrito para la foto. */
  scene: string;
  productName: string;
  aspectRatio: string;
}): string {
  return [
    `Vídeo corto en bucle para una página de venta de ${input.productName}.`,
    ``,
    `## La escena`,
    ``,
    input.scene,
    ``,
    `## Cómo se mueve`,
    ``,
    `- Entre ${LOOP_SECONDS[0]} y ${LOOP_SECONDS[1]} segundos, proporción ${input.aspectRatio}.`,
    `- **Acaba donde empieza**: se va a repetir sin corte, y un salto entre vuelta y vuelta se nota más que el propio movimiento.`,
    `- **Un solo movimiento**, pequeño y continuo: algo que cae, un líquido que gira, una mano que entra, vapor, un parpadeo. Dos cosas moviéndose a la vez parecen un anuncio de televisión.`,
    `- La cámara **quieta**. Moverla sobre una escena parada es lo que delata que era una foto.`,
    `- Sin texto, sin logotipos y sin cortes.`,
  ].join("\n");
}

/**
 * Lo que se puede subir a mano para un hueco de vídeo.
 *
 * `webm` primero porque pesa una fracción de un GIF con la misma calidad; el
 * GIF se admite porque es lo que sale de la mitad de las herramientas, y el
 * `webp` animado porque es lo que devuelven varios generadores.
 */
export const MOTION_TYPES = ["video/webm", "video/mp4", "image/gif", "image/webp"];

export const MOTION_LABEL = "WEBM, MP4, GIF o WEBP animado";

/**
 * Si un archivo sirve para un hueco de vídeo.
 *
 * Se mira el tipo declarado **y** la extensión: los navegadores mandan `webp`
 * animado con el mismo tipo que uno quieto, así que por el tipo solo no se
 * distingue — y rechazar un webp animado por eso obligaría a convertirlo a GIF
 * para nada.
 */
export function isMotionFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();

  return MOTION_TYPES.includes(type) || /\.(webm|mp4|gif|webp)$/.test(name);
}
