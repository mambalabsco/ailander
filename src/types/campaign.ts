import type { FacebookAdCopy } from "@/types/copy";

/**
 * Estructura de campaña de Meta.
 *
 * La convención de nombres y la jerarquía salen de `short.md`, donde una tanda
 * real quedaba así:
 *
 *   CAMPAÑA  [CL]_Tiroides_Fría_BOFU_Oferta_Precio
 *   └── ADSET13_BOFU_Oferta_Precio_Urgencia  → PÁGINA DE PRODUCTO
 *       ├── Ad36_Cuaderno_Busco_Mujeres
 *       ├── Ad37_Precio_Grande_Resultados_Cara
 *       ├── Ad38_Urgencia_Reloj_Verano
 *       ├── Ad39_Comparativa_Precio_Por_Día
 *       └── Ad40_Testimonio_Resultados_Pack
 *
 * Tres cosas que se deducen del ejemplo y que la plataforma respeta:
 *
 * - La numeración es **correlativa y global** por producto (adset 13, anuncios
 *   36 a 40), no reinicia en cada campaña. Por eso hay contadores.
 * - El **destino se fija en el adset**, no en el anuncio: los cinco del ejemplo
 *   comparten página de producto.
 * - La **oferta, la audiencia y los elementos que siempre van en el copy** son
 *   propiedades del adset, y todos sus anuncios las heredan.
 */

export const FUNNEL_STAGES = ["TOFU", "MOFU", "BOFU"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_META: Record<FunnelStage, { label: string; approach: string }> = {
  TOFU: {
    label: "TOFU · frío",
    approach: "Educación del mecanismo, dolor e historia. Todavía no se habla de precio.",
  },
  MOFU: {
    label: "MOFU · templado",
    approach: "Profundiza en el mecanismo y empieza a diferenciar frente a las alternativas.",
  },
  BOFU: {
    label: "BOFU · caliente",
    approach:
      "Precio concreto, oferta específica, testimonios reales, urgencia y comparativa de valor.",
  },
};

/* --------------------------------- Prelandings --------------------------------- */

/** Página intermedia entre el anuncio y la ficha de producto. */
export interface Prelanding {
  id: string;
  productId: string;
  name: string;
  url: string;
  /** Ángulo o promesa que sostiene la prelanding. */
  description: string;
  createdAt: string;
}

export type AdDestinationType = "producto" | "prelanding" | "prelanding-pendiente";

/**
 * A dónde manda el adset.
 *
 * `prelanding-pendiente` existe porque en la práctica la campaña se planifica
 * antes de que la prelanding esté hecha: se deja anotado que va a una y ya se
 * asignará cuál cuando exista, en vez de bloquear la planificación.
 */
export interface AdDestination {
  type: AdDestinationType;
  prelandingId?: string;
  url?: string;
  /** Nota de a qué prelanding debería ir, cuando aún no está creada. */
  plannedNote?: string;
}

export function destinationLabel(
  destination: AdDestination,
  prelandings: Prelanding[],
): string {
  if (destination.type === "producto") return "PÁGINA DE PRODUCTO";
  if (destination.type === "prelanding") {
    const prelanding = prelandings.find((item) => item.id === destination.prelandingId);
    return prelanding ? `PRELANDING · ${prelanding.name}` : "PRELANDING · (no encontrada)";
  }
  return destination.plannedNote ? `PRELANDING · ${destination.plannedNote}` : "PRELANDING";
}

/* ---------------------------- Formatos de anuncio corto ------------------------ */

export const SHORT_AD_FORMATS = [
  "cuaderno-manuscrito",
  "beneficios-flotantes",
  "urgencia-countdown",
  "comparativa-precio",
  "testimonios-grid",
  "antes-despues",
  "ugc-selfie",
  "mecanismo-explicado",
  "packshot-oferta",
  "pregunta-directa",
] as const;

/**
 * El formato de un anuncio.
 *
 * **Es una cadena libre, no una lista cerrada, y el cambio es deliberado.**
 * Los diez de `SHORT_AD_FORMATS` salieron de los ejemplos que había a mano; el
 * esquema los imponía como enum, así que el modelo no podía proponer ninguno
 * más aunque el producto pidiera otra cosa. Diez formatos no son el catálogo de
 * la publicidad: son los diez primeros que se escribieron.
 *
 * Los conocidos siguen sirviendo de referencia y traen su ficha; uno nuevo
 * funciona igual, solo que sin ficha previa.
 */
export type ShortAdFormat = string;

/** Los formatos con ficha escrita. El modelo puede proponer otros. */
export type KnownShortAdFormat = (typeof SHORT_AD_FORMATS)[number];

export interface ShortAdFormatMeta {
  id: string;
  name: string;
  /** Qué hace el formato en el feed. */
  role: string;
  /** De dónde sale: del documento o añadido siguiendo la misma lógica. */
  origin: "short.md" | "propio";
  /** Etapas del embudo donde rinde. */
  stages: FunnelStage[];
  /** Si la creatividad lleva texto incrustado. */
  hasText: boolean;
}

export const SHORT_AD_FORMAT_META: Record<KnownShortAdFormat, ShortAdFormatMeta> = {
  "cuaderno-manuscrito": {
    id: "cuaderno-manuscrito",
    name: "Cuaderno manuscrito",
    role: "Freno de scroll orgánico: no parece un anuncio, parece una nota escrita a mano.",
    origin: "short.md",
    stages: ["TOFU", "BOFU"],
    hasText: true,
  },
  "beneficios-flotantes": {
    id: "beneficios-flotantes",
    name: "Beneficios flotantes",
    role: "Persona con el producto y burbujas señalando cada resultado concreto.",
    origin: "short.md",
    stages: ["MOFU", "BOFU"],
    hasText: true,
  },
  "urgencia-countdown": {
    id: "urgencia-countdown",
    name: "Urgencia con cuenta atrás",
    role: "FOMO por temporada o plazo: el descuento tiene fecha de caducidad visible.",
    origin: "short.md",
    stages: ["BOFU"],
    hasText: true,
  },
  "comparativa-precio": {
    id: "comparativa-precio",
    name: "Comparativa de precio por día",
    role: "Racionaliza la compra enfrentando el coste diario con un gasto cotidiano.",
    origin: "short.md",
    stages: ["MOFU", "BOFU"],
    hasText: true,
  },
  "testimonios-grid": {
    id: "testimonios-grid",
    name: "Rejilla de testimonios",
    role: "Prueba social concentrada: varias reseñas con estrellas, nombre y ciudad.",
    origin: "short.md",
    stages: ["MOFU", "BOFU"],
    hasText: true,
  },
  "antes-despues": {
    id: "antes-despues",
    name: "Antes y después",
    role: "Prueba visual directa del resultado, con mismas condiciones en ambos lados.",
    origin: "propio",
    stages: ["MOFU", "BOFU"],
    hasText: true,
  },
  "ugc-selfie": {
    id: "ugc-selfie",
    name: "UGC tipo selfie",
    role: "Foto de móvil sin producción: baja la guardia del lector antes de vender.",
    origin: "propio",
    stages: ["TOFU", "MOFU"],
    hasText: false,
  },
  "mecanismo-explicado": {
    id: "mecanismo-explicado",
    name: "Mecanismo explicado",
    role: "Diagrama simple del porqué del problema. Educa en frío sin pedir nada.",
    origin: "propio",
    stages: ["TOFU", "MOFU"],
    hasText: true,
  },
  "packshot-oferta": {
    id: "packshot-oferta",
    name: "Packshot con oferta",
    role: "Producto limpio con el precio y el ahorro dominando la composición.",
    origin: "propio",
    stages: ["BOFU"],
    hasText: true,
  },
  "pregunta-directa": {
    id: "pregunta-directa",
    name: "Pregunta directa",
    role: "Una sola pregunta que cualifica: quien se reconoce, se para.",
    origin: "propio",
    stages: ["TOFU"],
    hasText: true,
  },
};

/** Formatos que rinden en una etapa concreta del embudo. */
export function formatsForStage(stage: FunnelStage): ShortAdFormatMeta[] {
  return SHORT_AD_FORMATS.map((id) => SHORT_AD_FORMAT_META[id]).filter((meta) =>
    meta.stages.includes(stage),
  );
}

/* ------------------------------- La jerarquía ---------------------------------- */

export interface ShortAd {
  id: string;
  productId: string;
  adsetId: string;
  /** Número correlativo global del producto: Ad36, Ad37... */
  number: number;
  name: string;
  format: ShortAdFormat;
  /** Prompt de imagen, listo para Higgsfield. */
  imagePrompt: string;
  content: FacebookAdCopy;
  createdAt: string;
}

export interface AdSet {
  id: string;
  productId: string;
  campaignId: string;
  number: number;
  name: string;
  stage: FunnelStage;
  focus: string;
  destination: AdDestination;
  /**
   * Ángulo del que salió la tanda.
   *
   * Es lo que permite atribuir el rendimiento de un anuncio corto a su ángulo:
   * el anuncio no lo guarda, porque todos los de un conjunto comparten origen.
   */
  angleId?: string;
  audience: string;
  objective: string;
  /** Escalera de precios que ancla todos los anuncios del conjunto. */
  offerStack: string[];
  /** Elementos que deben aparecer siempre en el copy. */
  alwaysInclude: string[];
  createdAt: string;
}

export interface Campaign {
  id: string;
  productId: string;
  name: string;
  countryCode: string;
  theme: string;
  stage: FunnelStage;
  focus: string;
  createdAt: string;
}

/**
 * Una unidad de anuncio dentro de un conjunto.
 *
 * Puede ser un anuncio corto (imagen + copy breve) o una pieza larga —long copy
 * o publirreportaje— cuyo cuerpo va en el texto principal. En Meta ambas son
 * anuncios, así que cuelgan del mismo sitio.
 */
export type AdUnit =
  | { kind: "corto"; ad: ShortAd }
  | {
      kind: "largo";
      copyId: string;
      number: number;
      name: string;
      headline: string;
      description: string;
      primaryText: string;
      format: string;
      methodId: string;
    };

/** La estructura completa, tal y como se visualiza. */
export interface CampaignTree {
  campaign: Campaign;
  adsets: { adset: AdSet; ads: ShortAd[]; units: AdUnit[] }[];
}

/* --------------------------- Convención de nombres ------------------------------ */

/** Normaliza un fragmento para que entre en un nombre: sin espacios ni acentos. */
function nameToken(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("_");
}

/** `[CL]_Tiroides_Fria_BOFU_Oferta_Precio` */
/**
 * El nombre de una campaña.
 *
 * **Sin la etapa del embudo**, y ese es el cambio: una campaña contiene
 * conjuntos de frío, templado y caliente a la vez. Ponerle `TOFU` en el nombre
 * describía mal lo que hay dentro y empujaba a crear una campaña por etapa, que
 * no es como se monta esto.
 *
 * La etapa vive donde corresponde: en cada conjunto.
 */
export function buildCampaignName(options: {
  countryCode: string;
  theme: string;
  focus: string;
}): string {
  const country = options.countryCode.toUpperCase().slice(0, 3);
  return `[${country}]_${nameToken(options.theme)}_${nameToken(options.focus)}`;
}

/** `ADSET13_BOFU_Oferta_Precio_Urgencia` */
export function buildAdsetName(options: {
  number: number;
  stage: FunnelStage;
  focus: string;
}): string {
  return `ADSET${options.number}_${options.stage}_${nameToken(options.focus)}`;
}

/** `Ad36_Cuaderno_Busco_Mujeres` */
export function buildAdName(options: {
  number: number;
  format: ShortAdFormat;
  hook: string;
}): string {
  const formatToken = nameToken(formatMeta(options.format).name.split(" ")[0]);

  /*
   * El modelo a veces devuelve el nombre ya montado.
   *
   * Salía `Ad2_UGC_Ad2_UGC_Selfie_Un_Mes_Tomandolas`: se le pide un gancho y
   * responde con un nombre completo, y al añadirle el prefijo quedaba dos veces.
   * No se puede arreglar solo en el prompt —la salida de un modelo no se
   * controla—, así que se quita aquí lo que ya viniera puesto.
   */
  const hook = options.hook
    .replace(/^Ad\d+[_\s-]*/i, "")
    .replace(new RegExp(`^${formatToken}[_\\s-]*`, "i"), "")
    .trim();

  return `Ad${options.number}_${formatToken}_${nameToken(hook).slice(0, 40)}`;
}

/**
 * La ficha de un formato, tenga o no una escrita.
 *
 * Los formatos que el modelo inventa no tienen ficha, y buscarlos directamente
 * en `SHORT_AD_FORMAT_META` devolvía `undefined` y rompía la pantalla al pintar
 * `.name`. Aquí se construye una ficha mínima a partir del propio identificador.
 */
export function formatMeta(id: string): ShortAdFormatMeta {
  const known = (SHORT_AD_FORMAT_META as Record<string, ShortAdFormatMeta | undefined>)[id];
  if (known) return known;

  return {
    id,
    // «antes-despues-abuela» → «Antes despues abuela».
    name: id.replace(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
    role: "Formato propuesto por el modelo para este producto.",
    origin: "propio",
    // Sin ficha no se sabe dónde rinde, así que se admite en las tres etapas en
    // vez de esconderlo: que lo decida quien lo lea.
    stages: ["TOFU", "MOFU", "BOFU"],
    hasText: true,
  };
}
