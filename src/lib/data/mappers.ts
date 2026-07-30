import type { Product } from "@/types";
import type { Store, StoreMarket } from "@/types/store";
import type { ProductImage, ProductImagePattern } from "@/types/visuals";
import type { OfferTier, ProductOffers } from "@/types/offer";
import type { Tables, TablesUpdate } from "@/types/database";

/**
 * Traducción entre las filas de Postgres y los tipos de la aplicación.
 *
 * Vive en un solo archivo a propósito. La base de datos usa `snake_case` y la
 * aplicación `camelCase`, y esa frontera es justo donde se cuelan los errores
 * silenciosos: un campo mal escrito no falla, simplemente llega vacío. Teniendo
 * las dos direcciones juntas, cualquier columna nueva se ve enseguida si falta
 * en uno de los dos sentidos.
 *
 * Los tipos de la aplicación no cambian: las páginas siguen recibiendo lo mismo
 * que recibían de los archivos JSON, así que la interfaz no se entera de nada.
 */

/* --------------------------------- Productos ----------------------------------- */

export function toProduct(row: Tables<"products">): Product {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    benefits: row.benefits,
    features: row.features,
    ingredients: row.ingredients,
    targetAudience: row.target_audience,
    problemsSolved: row.problems_solved,
    objections: row.objections,
    country: row.country,
    language: row.language,
    // `numeric` llega como número o como cadena según el driver; se normaliza.
    price: Number(row.price),
    ingredientDetails: (row.ingredient_details as Product["ingredientDetails"]) ?? undefined,
    // Nula cuando sale del mercado de la tienda; ahí manda aquel.
    currency: row.currency ?? undefined,
    landingUrl: row.landing_url,
    images: [],
    tone: row.tone,
    status: row.status,
    createdAt: row.created_at.slice(0, 10),
    owner: row.owner,
    researchInputs: {
      niche: row.niche,
      competitorUrls: row.competitor_urls,
      amazonUrl: row.amazon_url,
      targetAgeRange: row.target_age_range,
      targetGenders: row.target_genders,
    },
    storeId: row.store_id ?? undefined,
    marketId: row.market_id ?? undefined,
    handle: row.handle || undefined,
    duplicatedFromId: row.duplicated_from_id ?? undefined,
  };
}

/**
 * Solo las columnas que el formulario puede tocar. `user_id` lo pone la capa de datos.
 *
 * El tipo de vuelta es el de la tabla y no `Record<string, unknown>`: así, una
 * columna mal escrita la caza el compilador en lugar de acabar en un `update`
 * que Postgres rechaza en ejecución.
 */
export function fromProduct(product: Partial<Product>): TablesUpdate<"products"> {
  const row: TablesUpdate<"products"> = {};

  const assign = <K extends keyof TablesUpdate<"products">>(
    column: K,
    value: TablesUpdate<"products">[K] | undefined,
  ) => {
    if (value !== undefined) row[column] = value;
  };

  assign("name", product.name);
  assign("brand", product.brand);
  assign("category", product.category);
  assign("description", product.description);
  assign("benefits", product.benefits);
  assign("features", product.features);
  assign("ingredients", product.ingredients);
  assign("target_audience", product.targetAudience);
  assign("problems_solved", product.problemsSolved);
  assign("objections", product.objections);
  assign("country", product.country);
  assign("language", product.language);
  assign("price", product.price);
  assign("currency", product.currency);
  assign("ingredient_details", product.ingredientDetails);
  assign("landing_url", product.landingUrl);
  assign("tone", product.tone);
  assign("status", product.status);
  assign("owner", product.owner);
  assign("store_id", product.storeId ?? null);
  assign("market_id", product.marketId ?? null);
  assign("handle", product.handle ?? "");
  assign("duplicated_from_id", product.duplicatedFromId ?? null);

  if (product.researchInputs) {
    row.niche = product.researchInputs.niche;
    row.competitor_urls = product.researchInputs.competitorUrls;
    row.amazon_url = product.researchInputs.amazonUrl;
    row.target_age_range = product.researchInputs.targetAgeRange;
    row.target_genders = product.researchInputs.targetGenders;
  }

  return row;
}

/* ---------------------------------- Tiendas ------------------------------------ */

export function toMarket(row: Tables<"store_markets">): StoreMarket {
  return {
    id: row.id,
    countryCode: row.country_code,
    countryName: row.country_name,
    languageCode: row.language_code,
    languageName: row.language_name,
    currency: row.currency,
    domain: row.domain || undefined,
    pathPrefix: row.path_prefix,
    isPrimary: row.is_primary,
  };
}

export function toStore(row: Tables<"stores">, markets: Tables<"store_markets">[]): Store {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    domain: row.domain,
    platform: row.platform,
    markets: markets.map(toMarket),
    mentionBrandInCopy: row.mention_brand_in_copy,
    shopifyAdminToken: row.shopify_admin_token ?? undefined,
    shopifyShopDomain: row.shopify_shop_domain ?? undefined,
    shopifyApiKey: row.shopify_api_key ?? undefined,
    shopifyApiSecret: row.shopify_api_secret ?? undefined,
    shopCurrency: row.shop_currency ?? undefined,
    shopTimeZone: row.shop_time_zone ?? undefined,
    createdAt: row.created_at,
  };
}

/* ---------------------------------- Imágenes ----------------------------------- */

/**
 * La fila no guarda una URL sino la ruta dentro del bucket privado.
 *
 * Quien llama tiene que firmar esa ruta antes de pintarla; por eso `url` llega
 * como parámetro en vez de salir de la fila.
 */
export function toProductImage(row: Tables<"product_images">, signedUrl: string): ProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    pattern: row.pattern as ProductImagePattern | "subida",
    name: row.name,
    url: signedUrl,
    prompt: row.prompt || undefined,
    modelId: row.model_id || undefined,
    isPrimary: row.is_primary,
    source: row.source,
    copyId: row.copy_id ?? undefined,
    adId: row.ad_id ?? undefined,
    landingId: row.landing_id ?? undefined,
    shopifyUrl: row.shopify_url ?? undefined,
    concept: row.concept ?? undefined,
    originLabel: row.origin_label ?? undefined,
    createdAt: row.created_at,
  };
}

/* ----------------------------------- Ofertas ----------------------------------- */

export function toOfferTier(row: Tables<"offer_tiers">): OfferTier {
  return {
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    totalPrice: Number(row.total_price),
    compareAtPrice: row.compare_at_price === null ? undefined : Number(row.compare_at_price),
    freeShipping: row.free_shipping,
    gifts: row.gifts,
    isHighlighted: row.is_highlighted,
    note: row.note || undefined,
  };
}

export function toOffers(
  row: Tables<"product_offers"> | null,
  tiers: Tables<"offer_tiers">[],
): ProductOffers {
  return {
    tiers: tiers.map(toOfferTier),
    subscription: {
      enabled: row?.subscription_enabled ?? false,
      discountPercent: Number(row?.subscription_discount_percent ?? 0),
      frequency: row?.subscription_frequency ?? "",
      perks: row?.subscription_perks ?? [],
      cancellationPolicy: row?.subscription_cancellation_policy ?? "",
    },
    guarantee: row?.guarantee ?? "",
    freeShippingThreshold:
      row?.free_shipping_threshold === null || row?.free_shipping_threshold === undefined
        ? undefined
        : Number(row.free_shipping_threshold),
    source: (row?.source as ProductOffers["source"]) ?? "manual",
    updatedAt: row?.updated_at ?? new Date().toISOString(),
  };
}
