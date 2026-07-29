/**
 * Importación de un producto desde la URL de su ficha.
 *
 * Shopify expone cualquier ficha en JSON añadiendo `.json` a la URL del
 * producto. No requiere clave ni permisos: es el mismo dato que ya sirve la
 * tienda públicamente. Con eso se rellenan nombre, descripción, precio, handle
 * e **imágenes**, que es lo que más trabajo ahorra.
 *
 * Si la URL no es de Shopify o el JSON no está disponible, se devuelve un
 * resultado con `ok: false` y el motivo, en vez de inventarse los datos.
 */

export interface ShopifyImportResult {
  ok: boolean;
  reason?: string;
  product?: {
    title: string;
    handle: string;
    description: string;
    vendor: string;
    productType: string;
    price: number;
    currency?: string;
    images: string[];
    tags: string[];
    sourceUrl: string;
    domain: string;
  };
}

interface ShopifyVariant {
  price?: string;
  presentment_prices?: { price?: { currency_code?: string } }[];
}

interface ShopifyImage {
  src?: string;
}

interface ShopifyProductPayload {
  product?: {
    title?: string;
    handle?: string;
    body_html?: string;
    vendor?: string;
    product_type?: string;
    tags?: string[] | string;
    variants?: ShopifyVariant[];
    images?: ShopifyImage[];
  };
}

/** Quita el HTML de la descripción sin traerse una librería para ello. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normaliza la URL de la ficha a su endpoint JSON. */
export function toShopifyJsonUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (!/^https?:$/.test(url.protocol)) return null;

    // Nos quedamos solo con la parte /products/<handle>, sin variantes ni utm.
    const match = url.pathname.match(/\/products\/([^/]+)/);
    if (!match) return null;

    url.search = "";
    url.hash = "";
    url.pathname = `${url.pathname.slice(0, match.index)}/products/${match[1]}.json`;
    return url.toString();
  } catch {
    return null;
  }
}

export async function importFromProductUrl(rawUrl: string): Promise<ShopifyImportResult> {
  const jsonUrl = toShopifyJsonUrl(rawUrl);
  if (!jsonUrl) {
    return {
      ok: false,
      reason:
        "La URL no parece la ficha de un producto de Shopify. Debe contener /products/ y el identificador del producto.",
    };
  }

  let payload: ShopifyProductPayload;
  try {
    const response = await fetch(jsonUrl, {
      headers: { accept: "application/json" },
      // Sin caché: si el usuario reimporta es porque algo cambió.
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `La tienda respondió ${response.status}. Puede que no sea Shopify o que la ficha no sea pública.`,
      };
    }

    payload = (await response.json()) as ShopifyProductPayload;
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `No se pudo leer la ficha: ${error.message}`
          : "No se pudo leer la ficha.",
    };
  }

  const product = payload.product;
  if (!product?.title) {
    return { ok: false, reason: "La respuesta no contiene un producto." };
  }

  const firstVariant = product.variants?.[0];
  const price = Number(firstVariant?.price ?? 0);
  const currency = firstVariant?.presentment_prices?.[0]?.price?.currency_code;

  const url = new URL(jsonUrl);

  return {
    ok: true,
    product: {
      title: product.title,
      handle: product.handle ?? "",
      description: stripHtml(product.body_html ?? ""),
      vendor: product.vendor ?? "",
      productType: product.product_type ?? "",
      price: Number.isFinite(price) ? price : 0,
      currency,
      images: (product.images ?? [])
        .map((image) => image.src)
        .filter((src): src is string => Boolean(src)),
      tags: Array.isArray(product.tags)
        ? product.tags
        : typeof product.tags === "string"
          ? product.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [],
      sourceUrl: rawUrl,
      domain: `${url.protocol}//${url.host}`,
    },
  };
}
