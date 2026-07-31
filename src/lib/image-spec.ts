/**
 * La especificación visual de una imagen: cómo está hecha, no de qué está hecha.
 *
 * Sin imports, probado en `image-spec.test.ts`.
 *
 * ## Qué es una especificación y por qué no es una copia
 *
 * Es la receta de la foto: desde dónde se mira, qué luz tiene, qué hay en el
 * encuadre y cómo está repartido. Un fotógrafo que mira una foto de referencia y
 * anota «tres cuartos, luz lateral suave, fondo de mármol, hoja de eucalipto a la
 * derecha» hace exactamente esto, y después dispara **su** producto.
 *
 * ## Y por qué es mejor que el atajo
 *
 * El atajo —coger su foto y cambiarle el logo— deja **su envase**. En un
 * suplemento el bote es el producto: la forma, la tapa, la etiqueta. Una foto
 * reetiquetada anuncia el frasco de otro, y quien llegue a la ficha ve uno
 * distinto del que recibe. La especificación evita eso porque el producto de la
 * imagen final es el tuyo desde el principio.
 */

/* ------------------------------ Lo que se saca ----------------------------- */

export const SHOT_ANGLES = [
  "frontal",
  "tres-cuartos",
  "cenital",
  "picado",
  "contrapicado",
  "macro",
] as const;

export type ShotAngle = (typeof SHOT_ANGLES)[number];

export const LIGHT_KINDS = [
  "natural-suave",
  "natural-dura",
  "estudio-difusa",
  "estudio-dirigida",
  "contraluz",
  "clave-baja",
] as const;

export type LightKind = (typeof LIGHT_KINDS)[number];

export interface ImageSpec {
  /** De dónde sale, para poder volver a mirarla. */
  sourceUrl: string;
  /** Qué papel cumple en la página: héroe, beneficio, comparativa… */
  role: string;
  angle: ShotAngle;
  light: LightKind;
  /** El fondo, descrito: «mármol blanco», «madera clara desenfocada». */
  background: string;
  /** Lo que acompaña al producto, sin el producto. */
  props: string[];
  /** Cómo está repartido el encuadre. */
  composition: string;
  /** La paleta, en palabras. */
  palette: string;
  /**
   * Si la imagen lleva texto incrustado.
   *
   * Importa para dos cosas: el texto no se reproduce —es contenido, no
   * composición— y una imagen con mucho texto pide generarse aparte y
   * componerse después, porque los modelos escriben mal.
   */
  hasText: boolean;
}

/* -------------------------------- El prompt -------------------------------- */

/**
 * Lo que se le pide al modelo al mirar la imagen de referencia.
 *
 * Se le prohíbe describir la marca y el texto a propósito. No es una precaución
 * legal escrita por encima: si el modelo describe «el bote azul de MarcaX con la
 * etiqueta dorada», ese texto acaba dentro del prompt de generación y el
 * resultado sale pareciéndose al envase de otro — que es justo lo que hay que
 * evitar, porque tu producto tiene el suyo.
 */
export function buildSpecPrompt(role: string): string {
  return `Mira esta imagen y describe **cómo está hecha**, no qué marca aparece.

Papel de la imagen en la página: ${role}.

Devuelve:

- **angle**: desde dónde se mira. Uno de: ${SHOT_ANGLES.join(", ")}.
- **light**: qué luz tiene. Uno de: ${LIGHT_KINDS.join(", ")}.
- **background**: el fondo, en pocas palabras. «mármol blanco», «madera clara desenfocada», «fondo de estudio gris».
- **props**: lo que acompaña, **sin contar el producto**. Hojas, cápsulas sueltas, una taza, tela arrugada. Lista corta.
- **composition**: cómo se reparte el encuadre. Dónde cae el producto, cuánto aire deja, qué mira la vista primero.
- **palette**: los colores dominantes, en palabras.
- **hasText**: si lleva texto incrustado.

## Lo que NO debes describir

- **La marca, el envase o la etiqueta.** No digas de qué color es el bote, qué forma tiene ni qué pone. Esa parte la aporta otro producto: el de quien va a usar esta receta.
- **El texto que aparezca.** Marca \`hasText\` y sigue; no lo transcribas.
- **Las personas concretas.** Si hay alguien, di «una mujer de unos cuarenta, de medio cuerpo, mirando fuera de cuadro», no sus rasgos.

Estás anotando cómo iluminar y encuadrar, como haría un fotógrafo antes de disparar su propio producto.`;
}

/**
 * El prompt de generación, a partir de la especificación y del producto propio.
 *
 * El producto **siempre** va como referencia real, nunca descrito. Un envase
 * descrito con palabras sale inventado, y un envase inventado en un anuncio de
 * respuesta directa es una devolución: el cliente recibe algo que no se parece a
 * lo que vio.
 */
export function buildGenerationPrompt(spec: ImageSpec, productName: string): string {
  const parts = [
    `Fotografía de producto de ${productName}.`,
    `Encuadre ${spec.angle.replace(/-/g, " ")}.`,
    `Luz ${spec.light.replace(/-/g, " ")}.`,
    spec.background ? `Fondo: ${spec.background}.` : "",
    spec.props.length > 0 ? `En la escena: ${spec.props.join(", ")}.` : "",
    spec.composition ? `Composición: ${spec.composition}.` : "",
    spec.palette ? `Paleta: ${spec.palette}.` : "",
    "El envase es EXACTAMENTE el de la imagen de referencia adjunta: misma forma, misma tapa, misma etiqueta.",
    /*
     * El texto se prohíbe siempre, aunque la referencia lo tuviera.
     *
     * Los modelos escriben letras inventadas en cuanto se les deja, y un
     * envase con texto deforme es peor que uno sin nada. Si la pieza necesita
     * texto, se compone encima después.
     */
    "NO: texto de ningún tipo, marcas de agua, logotipos, envases distintos al de la referencia, manos deformes, estética de banco de imágenes.",
  ];

  return parts.filter(Boolean).join(" ");
}

/**
 * Si esta imagen conviene generarla o componerla.
 *
 * Las que llevan mucho texto —una comparativa, una tabla de precios— salen mejor
 * montadas en la landing con HTML que generadas: el texto queda seleccionable,
 * se traduce, se corrige sin volver a pagar y no sale con letras inventadas.
 */
export function shouldGenerate(spec: ImageSpec): { generate: boolean; reason: string } {
  if (spec.hasText) {
    return {
      generate: false,
      reason:
        "Lleva texto incrustado. Sale mejor montada en la página con HTML: el texto queda legible, se corrige sin pagar otra generación y no sale con letras inventadas.",
    };
  }

  return { generate: true, reason: "Es una escena sin texto: se genera con tu producto." };
}

/**
 * Cuánto se parece la receta a otra, para no generar cinco veces lo mismo.
 *
 * Una tienda repite el mismo montaje en varias imágenes, y generar una por cada
 * una gasta sin añadir variedad.
 *
 * **El ángulo cuenta como diferencia**, y esa es la parte que importa: el mismo
 * fondo visto de frente y en cenital son dos fotos que aportan cosas distintas a
 * una página. Dos recetas solo son la misma si coinciden en todo, ángulo
 * incluido.
 */
export function looksLikeDuplicate(a: ImageSpec, b: ImageSpec): boolean {
  const same = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();

  return (
    a.angle === b.angle &&
    a.light === b.light &&
    same(a.background, b.background) &&
    same(a.palette, b.palette) &&
    same(a.props.join(","), b.props.join(","))
  );
}

/** Quita las recetas repetidas, conservando la primera de cada montaje. */
export function dedupe(specs: ImageSpec[]): ImageSpec[] {
  const kept: ImageSpec[] = [];

  for (const spec of specs) {
    if (!kept.some((other) => looksLikeDuplicate(spec, other))) kept.push(spec);
  }

  return kept;
}
