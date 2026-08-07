/**
 * La franja de gancho que va sobre una creatividad.
 *
 * Es la barra de color con un titular corto en la parte de arriba de la imagen,
 * con las palabras que importan en **otro color**. Funciona porque se lee antes
 * que la foto: en el muro, la decisión de parar el scroll se toma en esa línea.
 *
 * ## Qué se decide aquí y qué no
 *
 * Aquí se decide el **texto**, qué palabras van resaltadas y **con qué colores**.
 * Pintarla es cosa del generador de imágenes, al que se le pasa esto ya
 * resuelto: pedirle «pon un titular llamativo» devuelve un color distinto cada
 * vez y la mitad ilegibles.
 *
 * ## Por qué el color se calcula
 *
 * Porque un rojo sobre una franja roja no se lee, y eso no se ve hasta tener la
 * imagen delante. El contraste tiene una fórmula —la de WCAG— y usarla cuesta
 * lo mismo que adivinar, con la diferencia de que no se equivoca.
 */

export interface HookText {
  /** La frase entera, tal y como se escribe. */
  text: string;
  /**
   * Los trozos resaltados, literales.
   *
   * Se guardan como texto y no como posiciones: un índice se descoloca en cuanto
   * alguien edita la frase a mano, y editarla a mano es lo normal.
   */
  highlights: string[];
}

export interface HookColors {
  /** El fondo de la franja. */
  band: string;
  /**
   * El texto normal sobre ella.
   *
   * Se llama `ink` y no `text` porque `text` ya es la frase: dos campos con el
   * mismo nombre en el mismo objeto acaban en un color pintado como titular.
   */
  ink: string;
  /** Las palabras que importan. */
  accent: string;
}

export interface Hook extends HookText, HookColors {}

/* --------------------------------- Contraste ---------------------------------- */

function channel(value: number): number {
  const v = value / 255;

  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa según WCAG. */
export function luminance(hex: string): number {
  const clean = hex.replace("#", "");

  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((one) => one + one)
          .join("")
      : clean;

  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);

  if ([red, green, blue].some((one) => Number.isNaN(one))) return 0;

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** La razón de contraste entre dos colores: de 1 (iguales) a 21 (negro y blanco). */
export function contrast(one: string, other: string): number {
  const a = luminance(one);
  const b = luminance(other);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/*
 * Las franjas que se usan, y de dónde salen.
 *
 * Son las cuatro que se ven en los anuncios que funcionan: el azul de titular
 * de noticia, el rojo de urgencia, el negro de recorte y el blanco de nota. No
 * es una paleta libre a propósito — un color inventado por el modelo en cada
 * pieza rompe la única ventaja de tener una plantilla.
 */
export const BANDS = [
  /*
   * Azul oscuro y no medio.
   *
   * El de la referencia es un azul claro con letra blanca: da 3,4 de contraste,
   * que se sostiene, pero deja sin sitio al acento — ningún color vivo llega al
   * mínimo sobre él, y el resaltado acababa del mismo color que el texto.
   * Bajándolo, entran el blanco y el amarillo, que es el look que se buscaba.
   */
  { id: "azul", band: "#1E5A8A", note: "Titular sobrio, de sección informativa." },
  { id: "rojo", band: "#E8352B", note: "Urgencia. El que más para el scroll y el que antes cansa." },
  { id: "negro", band: "#111111", note: "Serio y neutro. Deja mandar a la foto." },
  { id: "blanco", band: "#F5F5F5", note: "Limpio, para fotos oscuras o muy cargadas." },
] as const;

export type BandId = (typeof BANDS)[number]["id"];

/*
 * Los acentos posibles. Se elige por contraste contra la franja, no por gusto.
 *
 * El blanco y el negro entran porque sobre una franja de color saturado son a
 * menudo lo único que se lee de verdad.
 */
const ACCENTS = ["#FFE14D", "#31D158", "#FF4B3E", "#FFFFFF", "#111111", "#1E6FD9"];

/**
 * El mínimo de contraste que se acepta.
 *
 * Tres y no cuatro y medio: cuatro y medio es el umbral de WCAG para **texto
 * corrido**, y esto es un titular en negrita a cuarenta píxeles o más, donde la
 * norma admite tres. Exigir el de texto pequeño dejaba fuera cualquier acento
 * vivo y las franjas salían todas en blanco y negro.
 */
export const MIN_CONTRAST = 3;

/**
 * Los colores de una franja, ya comprobados.
 *
 * El texto normal sale de comparar blanco y negro contra la franja y quedarse
 * con el que más contraste dé. El acento se elige entre los candidatos que
 * pasan el mínimo **contra la franja** y que además se distinguen del texto
 * normal: si el acento se parece al texto, resaltar deja de resaltar.
 */
export function hookColors(bandId: BandId): HookColors {
  const found = BANDS.find((one) => one.id === bandId) ?? BANDS[0];
  const band = found.band;

  /*
   * Blanco mientras se lea, y solo entonces negro.
   *
   * Cogiendo el de más contraste salía letra negra sobre azul, que es correcta
   * y no es un titular: la franja de noticia es blanco sobre color, y en cuanto
   * el texto se oscurece deja de leerse como tal.
   */
  const ink = contrast(band, "#FFFFFF") >= MIN_CONTRAST ? "#FFFFFF" : "#111111";

  const accent =
    ACCENTS.filter((one) => contrast(one, band) >= MIN_CONTRAST && contrast(one, ink) >= 2).sort(
      (a, b) => contrast(b, band) - contrast(a, band),
    )[0] ?? ink;

  return { band, ink, accent };
}

/**
 * La franja que mejor va con una imagen, por su claridad.
 *
 * Una foto oscura pide franja clara y al revés: puestas del mismo tono, la
 * franja se funde con la imagen y el anuncio pierde el corte que lo hace
 * parecer un titular.
 */
export function bandForImage(imageLuminance: number): BandId {
  if (imageLuminance < 0.25) return "blanco";
  if (imageLuminance > 0.75) return "negro";

  return "azul";
}

/* ---------------------------------- El texto ----------------------------------- */

/**
 * Marca los resaltados en la frase, para poder enseñarla ya coloreada.
 *
 * Devuelve trozos en vez de HTML porque esto lo pinta React y también lo lee el
 * generador de imágenes: una cadena con etiquetas dentro obligaría a los dos a
 * desmontarla.
 */
export function hookParts(hook: HookText): { text: string; strong: boolean }[] {
  const marcas = hook.highlights.map((one) => one.trim()).filter(Boolean);

  if (marcas.length === 0) return [{ text: hook.text, strong: false }];

  /*
   * Los más largos primero.
   *
   * Con «grasa» y «8 kg de grasa» en la lista, empezar por el corto partiría el
   * largo por la mitad y saldrían dos resaltados donde había uno.
   */
  const ordenadas = [...marcas].sort((a, b) => b.length - a.length);

  let partes: { text: string; strong: boolean }[] = [{ text: hook.text, strong: false }];

  for (const marca of ordenadas) {
    const siguiente: typeof partes = [];

    for (const parte of partes) {
      if (parte.strong || !parte.text.includes(marca)) {
        siguiente.push(parte);
        continue;
      }

      const trozos = parte.text.split(marca);

      trozos.forEach((trozo, index) => {
        if (trozo) siguiente.push({ text: trozo, strong: false });
        if (index < trozos.length - 1) siguiente.push({ text: marca, strong: true });
      });
    }

    partes = siguiente;
  }

  return partes;
}

/** Cuántos caracteres caben antes de que la franja coma la imagen. */
export const HOOK_MAX = 90;

export function buildHookPrompt(input: {
  /** Qué se ve en cada creatividad, en el mismo orden en que se devolverán. */
  scenes: string[];
  productName: string;
  audience: string;
  country: string;
  /** Beneficio o promesa principal, si se sabe. */
  promise?: string;
}): string {
  return [
    `Eres redactor de ganchos para anuncios de Facebook e Instagram.`,
    ``,
    `Escribe la franja de titular que va encima de cada imagen de ${input.productName}, para ${input.audience} en ${input.country}.`,
    ...(input.promise ? [`La promesa del producto es: ${input.promise}.`] : []),
    ``,
    `## Las imágenes`,
    ``,
    ...input.scenes.map((scene, index) => `${index + 1}. ${scene}`),
    ``,
    `## Cómo`,
    ``,
    `- Uno **distinto** por imagen, y que cada uno hable de lo que se ve en la suya.`,
    `- Máximo ${HOOK_MAX} caracteres. Es una franja, no un párrafo: lo que no cabe se encoge hasta no leerse.`,
    `- Marca en «highlights» los trozos que van en otro color: uno o dos por gancho, y **literales**, copiados tal cual de la frase. Se resalta el dato o la promesa, no el verbo.`,
    `- Concreto antes que grandilocuente: un número, un plazo o una parte del cuerpo pesan más que «revolucionario».`,
    `- Sin promesas de curar, revertir o eliminar enfermedades. Sin «médicos recomiendan» ni citas atribuidas a nadie. Sin nombrar medios de comunicación.`,
    `- Nada que no puedas sostener: si el número no sale de este producto, no va.`,
    `- Escribe en el español de ${input.country}.`,
  ].join("\n");
}

/**
 * Cómo se le describe la franja al generador de imágenes.
 *
 * Con los colores en hexadecimal y la posición dicha: «un titular llamativo»
 * devuelve una franja distinta en cada pieza, y la mitad ilegibles.
 */
export function hookImageInstruction(hook: Hook): string {
  const resaltados = hook.highlights.filter(Boolean);

  return [
    `Sobre el borde superior de la imagen, una franja horizontal sólida de color ${hook.band} que ocupa todo el ancho.`,
    `Dentro, el texto «${hook.text}» en negrita condensada, en mayúsculas si cabe, color ${hook.ink}, centrado y ajustado al ancho.`,
    resaltados.length > 0
      ? `Estas palabras van en color ${hook.accent}, dentro de la misma frase y sin cambiar de tamaño: ${resaltados.map((one) => `«${one}»`).join(", ")}.`
      : "",
    `La franja no tapa la cara ni el producto: la imagen empieza justo debajo.`,
  ]
    .filter(Boolean)
    .join(" ");
}
