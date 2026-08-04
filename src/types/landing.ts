import type { LandingTheme } from "@/lib/landing-theme";

/**
 * Un publirreportaje como página web completa.
 *
 * **La pieza ya no es un texto, es una página.** Antes salía el cuerpo en plano
 * y había que maquetarlo a mano en Shopify: decidir dónde van las imágenes,
 * escribir los testimonios aparte, montar los botones. Aquí la estructura viene
 * dada y el HTML se deriva de ella.
 *
 * Se guardan **las secciones, no el HTML**. Así, mejorar la plantilla mejora
 * también las páginas que ya generaste.
 */

export type SectionKind =
  | "titular"
  | "entradilla"
  | "subtitulo"
  | "parrafo"
  | "lista"
  | "cita"
  | "destacado"
  | "imagen"
  | "cta"
  | "comentarios"
  | "aviso-legal"
  /* --- Elementos añadidos a partir de las páginas de referencia --- */
  /** Ficha del autor con foto, nombre y credenciales. */
  | "autor"
  /** Nota, valoración y número de reseñas, bajo el titular. */
  | "valoracion"
  /** «Visto en»: una fila de medios. Sin logos, solo nombres. */
  | "medios"
  /** Dos columnas enfrentadas: con el producto y sin él. */
  | "comparativa"
  /** Una cifra grande con su explicación. */
  | "dato"
  /** Los pasos de un mecanismo, numerados. */
  | "mecanismo"
  /** El sello de garantía. */
  | "garantia"
  /** Los escalones de precio. */
  | "oferta"
  /** Preguntas frecuentes. */
  | "faq"
  /** Una línea que separa y marca cambio de bloque. */
  | "separador";

export interface LandingSection {
  kind: SectionKind;
  /** El texto de la sección. En listas, cada elemento va en `items`. */
  text?: string;
  items?: string[];
  /** Para `imagen`: qué hueco ocupa, y así saber qué imagen poner. */
  slot?: string;
  /** Para `cta`: a dónde va. */
  href?: string;
  /** Para `comparativa`: qué va a cada lado. */
  left?: { title: string; items: string[] };
  right?: { title: string; items: string[] };
  /** Para `dato`: la cifra grande y su unidad. */
  value?: string;
  /** Para `faq`: las preguntas con su respuesta. */
  pairs?: { question: string; answer: string }[];
  /** Para `valoracion`: de 0 a 5, y cuántas reseñas. */
  rating?: number;
  reviews?: number;
}

/**
 * La cabecera de la página.
 *
 * Se puede apagar: hay tiendas donde la plantilla de Shopify ya pone la suya y
 * dos cabeceras seguidas se ven mal.
 */
export interface LandingHeader {
  enabled: boolean;
  /** La barra fina de arriba: «Oferta por tiempo limitado — 67% de descuento». */
  announcement?: string;
  /** El texto del logo. Si no hay imagen, se compone con tipografía. */
  logoText: string;
  /** Hueco de imagen del logo, cuando se genera con IA. */
  logoSlot?: string;
  /** La línea bajo el logo: «Contenido patrocinado» o la sección. */
  kicker?: string;
}

/** Quién firma la pieza. Con foto: sin ella la ficha se ve pobre. */
export interface LandingAuthor {
  name: string;
  credentials: string;
  /** Hueco de imagen del retrato. */
  photoSlot?: string;
  /** «Actualizado el 3 de marzo de 2026». */
  updatedAt?: string;
}

/**
 * Un hueco de imagen, con lo que hay que generar para llenarlo.
 *
 * El prompt viaja con el hueco para poder mandarlo a Higgsfield sin volver a
 * pensarlo, y el `alt` porque una landing sin textos alternativos es una
 * landing peor posicionada y menos accesible.
 */
export interface LandingImageSlot {
  slot: string;
  purpose: string;
  prompt: string;
  alt: string;
  aspectRatio: string;
}

/**
 * Un comentario del bloque social.
 *
 * Imita el formato de Facebook —nombre, tiempo, likes, respuestas— porque es el
 * que el lector reconoce sin tener que interpretarlo.
 */
export interface LandingComment {
  name: string;
  timeAgo: string;
  text: string;
  likes: number;
  replies?: { name: string; text: string; timeAgo: string }[];
}

export interface LandingPage {
  id: string;
  productId: string;
  copyId?: string;
  title: string;
  slug: string;
  methodId?: string;
  header?: LandingHeader;
  author?: LandingAuthor;
  sections: LandingSection[];
  imageSlots: LandingImageSlot[];
  comments: LandingComment[];
  /**
   * Ocultar la cabecera y el pie del tema de Shopify.
   *
   * Un publirreportaje con la navegación de la tienda encima deja de parecer un
   * artículo. Se decide por página: algunas piezas sí quieren el menú.
   */
  hideThemeChrome: boolean;
  /**
   * Colores, letra y ancho, sacados de la página que se calcó.
   *
   * Se guarda con la página y no se recalcula al dibujar: la referencia puede
   * rediseñarse, y una página publicada no puede cambiar de aspecto sola.
   * Vacío es el de siempre.
   */
  theme?: LandingTheme;
  /** La campaña con la que se etiqueta el tráfico hacia esta página. */
  utmCampaign?: string;
  /** El id de la página en Shopify, cuando ya se publicó. */
  shopifyPageId?: string;
  shopifyUrl?: string;
  publishedAt?: string;
  createdAt: string;
}
