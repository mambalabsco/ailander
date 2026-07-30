/**
 * Convertir un copy en guion de vídeo.
 *
 * Sin imports, probado en `script-prompt.test.ts`.
 *
 * ## La diferencia entre un copy y un guion
 *
 * Un copy se lee; un guion se escucha y se ve. La conversión no es partirlo en
 * trozos: hay que reescribir para el oído —frases más cortas, sin subordinadas
 * que se pierden al oírlas— y decidir **qué se ve** en cada una, que es
 * información que el copy no tiene.
 *
 * Por eso este prompt pide tres cosas por toma y no una: lo que se narra, lo que
 * se ve y lo que se mueve. Un guion sin la tercera produce animaciones que
 * flotan, que es el defecto característico del vídeo generado.
 */

/** La estructura de venta de un anuncio en vídeo. */
export const STRUCTURE = [
  "GANCHO — la primera frase decide si sigue viendo. Concreta, no una promesa genérica.",
  "AGITAR — el problema en una escena, no en un adjetivo.",
  "AUTORIDAD o HISTORIA — quién lo cuenta y por qué creerle.",
  "MECANISMO — por qué pasa el problema y cómo actúa la solución.",
  "PRUEBA — lo que sostiene la afirmación.",
  "TRANSFORMACIÓN — la vida después, en un momento cotidiano.",
  "PRODUCTO — el envase real.",
  "CIERRE — qué hacer ahora.",
];

export interface ScriptInput {
  productName: string;
  audience: string;
  country: string;
  /** El copy del que sale. */
  body: string;
  /** Cuántas tomas. Seis es lo normal para unos sesenta segundos. */
  shots: number;
  /** Segundos que debería durar el vídeo entero. */
  seconds: number;
  /** Qué claims puede sostener el producto. */
  allowedClaims?: string;
}

/**
 * Cuántas palabras caben en unos segundos de narración.
 *
 * A ritmo de anuncio en español se locutan unas 2,6 palabras por segundo. El
 * número importa porque una toma escrita para diez segundos y locutada en seis
 * deja el vídeo corto, y al revés obliga a pagar clips de diez.
 */
export function wordsFor(seconds: number): number {
  return Math.round(seconds * 2.6);
}

export function buildScriptPrompt(input: ScriptInput): string {
  const perShot = input.seconds / Math.max(1, input.shots);

  return `Eres guionista de anuncios en vídeo de respuesta directa. Vas a convertir un texto escrito en un guion de vídeo vertical.

## El producto

${input.productName}, para ${input.audience} en ${input.country}.
${input.allowedClaims ? `\nLo que el producto puede afirmar: ${input.allowedClaims}\n` : ""}
## El texto de partida

"""
${input.body}
"""

## Lo que tienes que hacer

${input.shots} tomas para un vídeo de unos ${input.seconds} segundos. Cada toma dura unos ${perShot.toFixed(1)} s, que son unas ${wordsFor(perShot)} palabras narradas.

**Un copy se lee; un guion se escucha.** No lo partas en trozos: reescríbelo para el oído. Frases cortas, sin subordinadas —al oírlas se pierden—, y una sola idea por toma.

Estructura de referencia, no obligatoria toda:

${STRUCTURE.map((step) => `- ${step}`).join("\n")}

## Cada toma lleva tres cosas, y las tres hacen falta

1. **guion** — lo que se narra. Escríbelo **fonético**: las siglas deletreadas («eme ce te» y no «MCT»), los números en palabras. Es lo que se le manda al generador de voz y así lo pronuncia bien.
2. **sub** — cómo se escribe en pantalla, **solo si difiere** del anterior. La toma del ejemplo llevaría \`sub: "lleva MCT"\`. Sin esto el subtítulo sale escrito tal y como se pronuncia, que es lo que más delata un vídeo hecho con IA.
3. **scene** — qué se ve, en inglés y en detalle: encuadre, quién hay, qué objetos, qué luz.
4. **motion** — qué se mueve, en inglés. Un gesto **con propósito** y una cámara concreta y lenta. Nunca «gira» ni «orbita»: es lo que hace que la toma parezca un salvapantallas.

Y el **rol** de cada toma:

- \`story\` — hay una persona. Es el único que admite sincronía de labios.
- \`science\` — anatomía, el mecanismo, un diagrama sereno.
- \`emotion\` — la metáfora, el miedo, la lucha.
- \`concept\` — ingredientes o cápsulas genéricas, sin marca.
- \`producto\` — el envase real.

Marca \`speaking: true\` solo si hay **una persona hablando de frente a cámara**. Si la toma es de mecanismo, de objeto o de paisaje, va en \`false\` aunque haya narración encima: la voz va por su cuenta.

## Dos reglas que no son opcionales

**La última toma es \`producto\`.** El vídeo cierra enseñando el envase real. Un anuncio que termina sin enseñar qué se vende no vende.

**No inventes credenciales, testimonios ni aprobaciones.** Ni médicos con nombre y apellido, ni estudios, ni sellos oficiales. Si el texto de partida trae una afirmación que el producto no sostiene, déjala fuera.

Escribe el guion en el español de ${input.country}. Las descripciones de escena y movimiento, en inglés, que es lo que entienden los generadores de imagen.`;
}

/**
 * El ancla de estilo del vídeo.
 *
 * Se pide aparte del guion y en una sola frase porque va **idéntica en todas las
 * tomas**: es lo único que hace que las imágenes generadas por separado parezcan
 * del mismo vídeo. Si se pidiera dentro de cada toma, el modelo la variaría un
 * poco cada vez y se perdería el efecto.
 */
export function buildStylePrompt(input: {
  productName: string;
  audience: string;
  country: string;
}): string {
  return `Define el estilo visual de un anuncio en vídeo de ${input.productName}, para ${input.audience} en ${input.country}.

Devuelve dos cosas, las dos en inglés y muy concretas:

1. **render** — una sola frase de estilo de render que se va a repetir **idéntica** en todas las tomas del vídeo: tipo de luz, lente, textura, tratamiento de color. Es lo que hace que catorce imágenes generadas por separado parezcan del mismo vídeo, así que tiene que ser específica. «cinematic» no vale; «soft volumetric side light, 35mm lens, subtle film grain» sí.

2. **accent** — un color de acento que aparezca en todas las tomas. Sutil en las de mecanismo, protagonista en las de producto.

Que encaje con lo que vende el producto: un suplemento de salud no se ilumina como un refresco.`;
}
