/**
 * Entender un vídeo que funciona, para poder escribir otro.
 *
 * Sin imports, probado en `analysis.test.ts`.
 *
 * ## Por qué fotogramas y no el vídeo
 *
 * Claude mira imágenes, no vídeo. Así que se descompone: unos cuantos
 * fotogramas y la transcripción del audio. Suena a apaño y no lo es — es
 * exactamente lo que hay que mirar. Un anuncio de respuesta directa se explica
 * por **qué se ve al principio, qué se dice encima y cuándo cambia el plano**, y
 * eso está entero en los fotogramas y en el texto.
 *
 * ## Dónde se mira más
 *
 * Los primeros tres segundos deciden el anuncio. Ahí se pierde a la mayoría de
 * la gente, así que se muestrea denso al principio y suelto después: seis
 * fotogramas en los tres primeros segundos dicen más del anuncio que sesenta
 * repartidos por igual.
 *
 * ## Qué se saca y qué no
 *
 * Sale **cómo está construido**: el gancho, el ritmo, los tipos de plano, dónde
 * cae el texto en pantalla, cuándo aparece el producto, cómo cierra. No salen sus
 * imágenes ni su guion: el vídeo nuevo se escribe con la investigación del
 * producto propio, igual que el resto de la plataforma.
 */

/* ------------------------ Qué fotogramas hay que mirar --------------------- */

/** Cuántos fotogramas se le mandan al modelo como mucho. */
export const MAX_FRAMES = 20;

/**
 * Los tres primeros segundos, muestreados a medio segundo.
 *
 * No es una elección estética: es donde se decide si el anuncio se ve. Un plano
 * que cambia en el segundo 1,5 y otro que aguanta hasta el 3 son dos anuncios
 * distintos, y con un fotograma por segundo esa diferencia no se ve.
 */
const HOOK_MARKS = [0, 0.5, 1, 1.5, 2, 2.5, 3];

/**
 * En qué segundos hay que sacar fotograma.
 *
 * Denso al principio y repartido después, sin pasar del tope. Siempre cae uno
 * cerca del final: el cierre —la llamada a la acción, el envase en pantalla— es
 * la otra mitad del anuncio.
 */
export function framePlan(duration: number, max = MAX_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const marks = HOOK_MARKS.filter((mark) => mark < duration).slice(0, max);

  // El resto del vídeo, repartido por igual entre lo que queda de cupo.
  const remaining = max - marks.length;
  const start = marks.length > 0 ? marks[marks.length - 1] : 0;

  if (remaining > 0 && duration > start) {
    const step = (duration - start) / (remaining + 1);
    for (let index = 1; index <= remaining; index += 1) {
      marks.push(Number((start + step * index).toFixed(2)));
    }
  }

  /*
   * El último fotograma no se saca en el segundo exacto del final.
   *
   * Muchos codificadores no tienen fotograma ahí y ffmpeg devuelve una imagen
   * negra o directamente nada, así que se retrocede un pelo. Un cierre en negro
   * haría creer que el anuncio termina fundido a negro cuando no es así.
   */
  return marks.map((mark) => Math.min(mark, Math.max(0, duration - 0.1)));
}

/* --------------------------- Lo que se saca del vídeo ---------------------- */

export interface VideoBeat {
  /** En qué segundo empieza. */
  at: number;
  /** Qué se ve: «primer plano de una mujer mirando a cámara». */
  shot: string;
  /** Qué hace ahí ese plano: gancho, problema, mecanismo, prueba, cierre. */
  role: string;
  /** El texto sobreimpreso, si lo hay. */
  onScreenText: string;
}

export interface VideoAnalysis {
  /** Cómo entra, descrito. Es lo que más se reutiliza. */
  hook: string;
  /** Qué promete y a quién le habla. */
  promise: string;
  /** El tono: quién parece que habla y cómo. */
  voice: string;
  beats: VideoBeat[];
  /** Cada cuánto cambia el plano, en segundos. */
  averageShotSeconds: number;
  /** Dónde y cómo aparece el producto. */
  productMoment: string;
  /** Cómo cierra y qué pide. */
  callToAction: string;
  /** Lo que hace que funcione, en tus palabras. */
  whyItWorks: string;
}

/* -------------------------------- El prompt -------------------------------- */

export function buildAnalysisPrompt(options: {
  duration: number;
  marks: number[];
  transcript: string;
  /** De qué producto es, si se sabe. Solo para situar. */
  context?: string;
}): string {
  const { duration, marks, transcript } = options;

  return `Analiza este anuncio en vídeo. Vas a describir **cómo está construido**, para poder escribir otro anuncio distinto con la misma construcción.

Dura ${duration.toFixed(1)} segundos. Te paso ${marks.length} fotogramas, en este orden, tomados en los segundos: ${marks.map((mark) => mark.toFixed(1)).join(", ")}.

**Los primeros fotogramas están más juntos a propósito**: los tres primeros segundos son donde se decide si el anuncio se ve, y ahí hay que mirar con más detalle.

${
  transcript
    ? `## Lo que se oye\n\n${transcript}\n`
    : "## Audio\n\nNo hay voz, o no se pudo transcribir. **El texto en pantalla es entonces todo lo que dice el anuncio**: léelo con cuidado, porque es el guion.\n"
}
${options.context ? `## Contexto\n\n${options.context}\n` : ""}

## Lo que tienes que devolver

- **hook**: cómo entra. Los tres primeros segundos, descritos: qué se ve, qué se oye, qué hace que alguien no siga bajando. Es el campo que más se va a reutilizar, así que sé concreto — «primer plano de manos apretando una rodilla hinchada mientras una voz dice que llevaba años así» dice algo; «un gancho potente» no dice nada.
- **promise**: qué promete y a quién le habla.
- **voice**: quién parece que habla —una clienta, un médico, una voz en off— y en qué tono.
- **beats**: los momentos del anuncio, en orden. Para cada uno: en qué segundo empieza (\`at\`), qué plano es (\`shot\`), qué papel cumple (\`role\`: gancho, problema, mecanismo, prueba, oferta, cierre) y el texto en pantalla (\`onScreenText\`).

- **averageShotSeconds**: cada cuánto cambia el plano de media. Cuéntalo de los fotogramas: si entre dos consecutivos cambia la escena, hubo corte.
- **productMoment**: en qué segundo aparece el producto y cómo. Si no aparece hasta el final, dilo — es una decisión, no un olvido.
- **callToAction**: cómo cierra y qué pide exactamente.
- **whyItWorks**: por qué funciona esta construcción. La parte útil: qué orden sigue, dónde coloca la objeción, qué prueba usa y cuándo.

### El texto en pantalla se lee entero y literal

**Léelo tal cual aparece, palabra por palabra**, en \`onScreenText\`. Todo lo que esté escrito encima del vídeo: subtítulos, rótulos, cifras, el sello de garantía, lo que ponga el botón.

Es la parte que más se subestima. La mayoría de la gente ve estos anuncios **sin sonido**, así que el texto en pantalla no acompaña al guion: **es** el guion. Un anuncio donde el subtítulo dice «llevo 3 años con esto» en el segundo dos y otro donde dice «los médicos no te lo cuentan» son dos anuncios distintos aunque las imágenes sean iguales.

Si en un fotograma no hay texto, deja \`onScreenText\` vacío. No lo resumas ni lo traduzcas: literal y en su idioma.

## Lo que NO debes devolver

- **No parafrasees su guion hablado** línea a línea. La voz se describe por su función, no por sus frases. El texto **en pantalla** sí va literal: es un dato del anuncio, corto y necesario para entender qué se lee sin sonido.
- **No describas su marca ni su envase.** El anuncio nuevo lleva otro producto.
- **No inventes lo que no se ve.** Entre dos fotogramas puede pasar cualquier cosa: si un tramo no se ve, dilo en vez de rellenarlo.

Estás anotando cómo está montado para poder montar otro, como haría alguien que ve el anuncio de la competencia y toma notas.`;
}

/* --------------------------------- Repaso ---------------------------------- */

/**
 * Lo que hay que mirar antes de fiarse del análisis.
 *
 * El modelo puede describir bien y aun así haber inventado un tramo que no se
 * ve. Estas comprobaciones son baratas y cazan lo que se nota después: momentos
 * fuera del vídeo, un ritmo imposible, un gancho vacío.
 */
export function reviewAnalysis(
  analysis: VideoAnalysis,
  duration: number,
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];

  const outside = analysis.beats.filter((beat) => beat.at < 0 || beat.at > duration + 0.5);
  if (outside.length > 0) {
    warnings.push(
      `${outside.length} momento(s) caen fuera del vídeo (dura ${duration.toFixed(1)} s). Se inventaron.`,
    );
  }

  const disordered = analysis.beats.some(
    (beat, index) => index > 0 && beat.at < analysis.beats[index - 1].at,
  );
  if (disordered) warnings.push("Los momentos no van en orden de tiempo.");

  if (analysis.beats.length === 0) warnings.push("No sacó ningún momento.");

  /*
   * Un plano de menos de medio segundo es un parpadeo, no un plano; más de
   * quince es un vídeo que no corta nunca. Cualquiera de las dos cosas existe,
   * pero casi siempre significa que contó mal los cortes.
   */
  if (analysis.averageShotSeconds > 0 && analysis.averageShotSeconds < 0.5) {
    warnings.push("Dice que los planos duran menos de medio segundo: probablemente contó de más.");
  }
  if (analysis.averageShotSeconds > 15) {
    warnings.push("Dice que los planos duran más de quince segundos: probablemente contó de menos.");
  }

  if (analysis.hook.trim().length < 40) {
    warnings.push("El gancho está descrito de más arriba: no sirve para escribir otro.");
  }

  return { ok: warnings.length === 0, warnings };
}

/* ------------------------- Reutilizarlo en un guion ------------------------ */

/**
 * El análisis convertido en instrucciones para escribir un guion nuevo.
 *
 * Va lo funcional —el orden, el ritmo, dónde entra el producto— y **no** va el
 * texto. Es la misma línea que en las páginas: se reproduce la construcción y lo
 * que se dice sale de la investigación propia.
 */
export function asScriptReference(analysis: VideoAnalysis, name: string): string {
  const beats = analysis.beats
    .map((beat) => `- ${beat.at.toFixed(1)}s · ${beat.role} — ${beat.shot}`)
    .join("\n");

  return `## Anuncio de referencia: ${name}

**Cómo entra:** ${analysis.hook}

**Qué promete:** ${analysis.promise}

**Quién habla:** ${analysis.voice}

**Cómo se reparte:**

${beats}

**Ritmo:** cambia de plano cada ${analysis.averageShotSeconds.toFixed(1)} s de media.

**El producto:** ${analysis.productMoment}

**Cierre:** ${analysis.callToAction}

**Por qué funciona:** ${analysis.whyItWorks}

---

Sigue esta **construcción**: el mismo orden, el mismo ritmo, el producto en el mismo momento relativo. Lo que se dice sale de la investigación de arriba — ni una frase, ni un dato, ni un ingrediente de la referencia.`;
}
