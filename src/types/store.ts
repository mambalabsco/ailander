/**
 * Tiendas y mercados.
 *
 * El problema que resuelve este modelo: una tienda no es un país. Una tienda de
 * Shopify puede vender en Chile, México y España, y en dos idiomas, desde el
 * mismo dominio o desde subcarpetas. Meter país e idioma en el producto —como
 * estaba hasta ahora— obliga a duplicarlo todo y pierde de vista que comparten
 * marca, dominio y tono.
 *
 * Por eso hay tres niveles:
 *
 *   Tienda      marca, dominio, plataforma, tono de marca
 *   └── Mercado país + idioma + moneda + ruta o dominio propio
 *       └── Producto  vive en **un** mercado concreto
 *
 * El mismo producto en Chile y en México son dos productos que apuntan a
 * mercados distintos de la misma tienda, y se crean duplicando (ver
 * `duplicateProductToMarket`), no rellenando el formulario otra vez.
 */

export type StorePlatform = "shopify" | "woocommerce" | "otra";

export const STORE_PLATFORM_LABELS: Record<StorePlatform, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  otra: "Otra",
};

/**
 * Un mercado es la combinación de país e idioma en la que se vende.
 *
 * `urlPattern` describe cómo se construye la URL de un producto en ese mercado:
 * unas tiendas usan subcarpeta (`/es-mx/products/...`), otras un dominio propio
 * por país. Guardarlo aquí evita tener que escribir la URL a mano en cada
 * producto y en cada anuncio.
 */
export interface StoreMarket {
  id: string;
  countryCode: string;
  countryName: string;
  languageCode: string;
  languageName: string;
  currency: string;
  /** Dominio propio del mercado, si lo tiene. Si no, se usa el de la tienda. */
  domain?: string;
  /** Prefijo de ruta, por ejemplo `/es-mx`. Vacío si el mercado es el principal. */
  pathPrefix: string;
  isPrimary: boolean;
}

export interface Store {
  id: string;
  name: string;
  /** Marca tal y como se nombra en los textos. */
  brand: string;
  domain: string;
  platform: StorePlatform;
  markets: StoreMarket[];
  /**
   * Si los textos deben nombrar la marca o basta con el nombre del producto.
   *
   * En muchas campañas de respuesta directa mencionar la tienda distrae: el
   * lector no la conoce y el nombre no aporta. El enlace siempre lleva al
   * dominio, esto solo afecta al cuerpo del texto.
   */
  mentionBrandInCopy: boolean;
  /**
   * Token de Admin API de la app personalizada **de esta tienda**.
   *
   * Es por tienda y no por cuenta: cada una es una app distinta con su propio
   * token. Nunca viaja al navegador; en la interfaz solo se sabe si está puesto.
   */
  shopifyAdminToken?: string;
  /**
   * El dominio `.myshopify.com`, no el propio.
   *
   * La Admin API **solo responde en este**: con el dominio de cara al público
   * devuelve 404. Se guarda al conectar la tienda.
   */
  shopifyShopDomain?: string;
  /** Clave pública de la app de Shopify de esta tienda. */
  shopifyApiKey?: string;
  /** Secreto de esa app. Nunca viaja al navegador. */
  shopifyApiSecret?: string;
  /**
   * Moneda en la que la tienda **liquida**, según Shopify.
   *
   * No es la del mercado. La tienda de México vende en pesos y liquida en
   * dólares, y los pedidos llegan por la API en dólares: es esta la moneda de
   * todos los importes de los informes de beneficio. Etiquetarlos con la del
   * mercado daría un ticket medio veinte veces menor del real.
   */
  shopCurrency?: string;
  /** Zona horaria de la tienda: decide a qué día pertenece cada pedido. */
  shopTimeZone?: string;
  /**
   * El logo de la marca.
   *
   * Vive aquí y no en cada landing: se generaba por página, así que dos páginas
   * de la misma tienda salían con logos distintos — lo contrario de lo que hace
   * un logo. Lo usan las landings, las creatividades y los vídeos.
   */
  logoUrl?: string;
  /** El prompt con el que se generó, para rehacerlo igual o variarlo. */
  logoPrompt?: string;
  createdAt: string;
}

/** URL de un producto en un mercado concreto. */
export function productUrlFor(
  store: Store,
  market: StoreMarket,
  productHandle: string,
): string {
  const domain = market.domain || store.domain;
  const base = domain.replace(/\/+$/, "");
  const prefix = market.pathPrefix.replace(/\/+$/, "");
  return `${base}${prefix}/products/${productHandle}`;
}

export function findMarket(store: Store, marketId: string): StoreMarket | undefined {
  return store.markets.find((market) => market.id === marketId);
}

export function marketLabel(market: StoreMarket): string {
  return `${market.countryName} · ${market.languageName}`;
}

/* ----------------------- Qué se hereda al duplicar ----------------------------- */

/**
 * Al llevar un producto a otro mercado, no todo vale igual.
 *
 * Esta tabla es la parte importante del duplicado: distingue lo que se puede
 * arrastrar de lo que **hay que regenerar**, porque depende del país o del
 * idioma. Copiar la investigación entera a otro país produciría un documento
 * que parece correcto y no lo es — datos de mercado de un sitio presentados
 * como si fueran de otro.
 */
export interface DuplicationRule {
  key: string;
  label: string;
  behaviour: "hereda" | "traduce" | "regenera";
  reason: string;
}

export const DUPLICATION_RULES: DuplicationRule[] = [
  {
    key: "ficha",
    label: "Ficha del producto",
    behaviour: "traduce",
    reason: "El producto es el mismo; cambian el idioma, la moneda y el precio.",
  },
  {
    key: "awareness",
    label: "1 · Concienciación",
    behaviour: "regenera",
    reason:
      "El tamaño de mercado, la demografía y el reparto por nivel de conciencia son propios de cada país.",
  },
  {
    key: "competitors",
    label: "2 · Competencia",
    behaviour: "regenera",
    reason: "Los competidores DTC de un país rara vez son los mismos que los de otro.",
  },
  {
    key: "avatars",
    label: "3 · Avatares",
    behaviour: "regenera",
    reason:
      "Las citas textuales pierden todo su valor traducidas: el lenguaje real del cliente es lo que aportan.",
  },
  {
    key: "master",
    label: "4 · Investigación maestra",
    behaviour: "regenera",
    reason: "Se construye sobre los tres anteriores, así que se rehace con ellos.",
  },
  {
    key: "desire",
    label: "5 y 6 · Deseo masivo",
    behaviour: "hereda",
    reason:
      "El mecanismo del producto no cambia al cruzar una frontera. Conviene revisar el orden del ranking, no rehacerlo.",
  },
  {
    key: "angles",
    label: "Ángulos",
    behaviour: "traduce",
    reason:
      "El mecanismo del problema y el de la solución se mantienen; la historia y las referencias culturales se adaptan.",
  },
  {
    key: "copies",
    label: "Copys y anuncios",
    behaviour: "regenera",
    reason: "Se reescriben en el idioma y el registro del nuevo mercado, no se traducen.",
  },
  {
    key: "images",
    label: "Imágenes de producto",
    behaviour: "hereda",
    reason:
      "El packshot sirve igual. Solo hay que rehacer las que llevan texto incrustado.",
  },
  {
    key: "performance",
    label: "Rendimiento marcado",
    behaviour: "regenera",
    reason:
      "Lo que funcionó en un mercado es una hipótesis en el otro, no un dato. Se arranca limpio y se anota aparte.",
  },
];

export const DUPLICATION_BEHAVIOUR_META: Record<
  DuplicationRule["behaviour"],
  { label: string; className: string }
> = {
  hereda: {
    label: "Se hereda",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  traduce: {
    label: "Se adapta",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  regenera: {
    label: "Hay que regenerar",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};
