import type { Shot } from "./shots.ts";

/**
 * El texto del anuncio que acompaña al vídeo, sacado de su guion.
 *
 * ## Por qué del guion y no del copy de origen
 *
 * Un vídeo puede nacer de un copy largo, pero lo que se acaba montando no es
 * ese copy: las tomas se recortan, se reordenan y se reescriben en fonético
 * para la voz. El anuncio publicado tiene que prometer **lo que el vídeo dice**,
 * no lo que decía el borrador del que salió, porque quien lo lee está a punto
 * de ver el vídeo y nota la diferencia en el primer segundo.
 *
 * ## Los límites
 *
 * Meta corta el título a 40 caracteres y la descripción a 30. No avisa: los
 * recorta con puntos suspensivos en la vista del anuncio, así que un título de
 * 55 se publica mutilado y solo se ve mirando el anuncio ya en marcha. Se piden
 * en el prompt y se recortan al guardar, porque pedir no es garantizar.
 */

/** Lo que Meta deja ver antes de cortar. */
export const HEADLINE_MAX = 40;
export const DESCRIPTION_MAX = 30;

export interface VideoAdCopy {
  primaryText: string;
  headline: string;
  description: string;
}

/**
 * El guion tal y como se oye, en orden.
 *
 * Se prefiere `sub` a `guion` cuando existe: el guion está escrito fonético
 * —«eme ce te» para que la voz lo pronuncie— y eso, leído por el modelo que
 * redacta, produce un anuncio que habla de «eme ce te» en vez de MCT.
 */
export function videoScript(shots: Pick<Shot, "n" | "guion" | "sub">[]): string {
  return shots
    .map((shot) => (shot.sub?.trim() || shot.guion?.trim() || "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Recorta sin cortar una palabra por la mitad.
 *
 * Un título cortado en seco —«Adelgaza sin pasar ham»— se lee como un error de
 * la plataforma. Si no cabe ni la primera palabra se corta y ya: es preferible
 * a devolver vacío, que dejaría el anuncio sin título.
 */
export function fitAdField(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();

  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");

  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/** Los tres campos, ya con las medidas que admite el gestor de anuncios. */
export function fitAdCopy(copy: VideoAdCopy): VideoAdCopy {
  return {
    primaryText: copy.primaryText.trim(),
    headline: fitAdField(copy.headline, HEADLINE_MAX),
    description: fitAdField(copy.description, DESCRIPTION_MAX),
  };
}

export function buildVideoCopyPrompt(input: {
  script: string;
  productName: string;
  /** Lo que se sepa del producto: beneficios, público, oferta. Puede faltar. */
  context?: string;
  /** Segundos que dura el montaje, si ya está montado. */
  seconds?: number;
}): string {
  return [
    `Eres redactor de anuncios de respuesta directa para Facebook e Instagram.`,
    ``,
    `Escribe el texto que acompaña a un vídeo de ${input.productName}.`,
    ...(input.seconds && input.seconds > 0
      ? [`El vídeo dura ${Math.round(input.seconds)} segundos.`]
      : []),
    ``,
    `## El guion del vídeo`,
    ``,
    input.script,
    ``,
    ...(input.context ? [`## Sobre el producto`, ``, input.context, ``] : []),
    `## Qué escribir`,
    ``,
    `1. **Texto principal**: entre 60 y 120 palabras. Empieza por el problema, no por el producto. Va encima del vídeo y se lee antes de darle al play: su trabajo es que le den al play.`,
    `2. **Título**: máximo ${HEADLINE_MAX} caracteres. Va debajo del vídeo, junto al botón.`,
    `3. **Descripción**: máximo ${DESCRIPTION_MAX} caracteres. Una línea de refuerzo.`,
    ``,
    `## Cómo`,
    ``,
    `- El texto tiene que prometer **lo que el vídeo enseña**. Quien lo lee va a ver el vídeo justo después y nota cualquier promesa que no aparezca.`,
    `- No repitas el gancho del vídeo palabra por palabra: dicho dos veces seguidas suena a error, no a insistencia.`,
    `- Nada de comillas, ni de «en este vídeo», ni de describir el vídeo desde fuera.`,
    `- Sin promesas médicas ni curativas: Meta las rechaza y la cuenta se resiente.`,
    `- Escribe en el mismo español del guion, con su mismo tuteo o usted.`,
    `- Respeta los límites de caracteres: lo que se pase, Meta lo corta con puntos suspensivos en el anuncio publicado.`,
  ].join("\n");
}
