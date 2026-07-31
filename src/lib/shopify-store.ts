import "server-only";

import { shopifyGraphql } from "@/lib/shopify";
import type { Store } from "@/types/store";

/**
 * Gestión de la tienda: productos y tema.
 *
 * Verificado contra la documentación de la versión 2026-07, no deducido.
 *
 * ## `productSet` en vez de `productCreate` + `productUpdate`
 *
 * Es una sola mutación que crea o actualiza según lleve identificador, y maneja
 * variantes, opciones y medios de una vez. Antes hacían falta tres llamadas
 * —crear el producto, crear las variantes en bloque, asociar las imágenes— y
 * cada una podía fallar dejando el producto a medias.
 *
 * **Trampa que hay que conocer: los campos de lista se reemplazan enteros.** Si
 * mandas `variants` con dos y el producto tenía cinco, las otras tres se borran.
 * Lo mismo con colecciones y metacampos. Por eso `updateProduct` lee antes lo
 * que hay y lo vuelve a mandar completo.
 *
 * ## Los permisos de tema son dos, y la documentación solo menciona uno
 *
 * En el panel de la app aparecen en filas separadas: `read_themes` y
 * `write_themes` bajo «Theme templates», y **`write_theme_code` bajo «Theme
 * Code»**, que viene desmarcado. La documentación de `themeFilesUpsert` solo
 * habla del primer grupo y de una exención concedida a mano.
 *
 * Se piden los tres y que Shopify conceda lo que conceda. Marcar
 * `write_theme_code` en el panel y reconectar es lo primero que hay que probar;
 * si aun así falla, entonces sí es la exención. El error de Shopify no
 * distingue entre los dos casos, así que el mensaje los enumera.
 */

/* ------------------------------- Productos --------------------------------- */

export interface ProductVariantInput {
  /** Para actualizar una existente. Sin él, se crea. */
  id?: string;
  title?: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  /** Valores de las opciones, en el orden de `options`. */
  optionValues?: { name: string; optionName: string }[];
}

export interface ProductInput {
  /** Para actualizar. Sin él, se crea uno nuevo. */
  id?: string;
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  handle?: string;
  tags?: string[];
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  /** Nombres de las opciones y sus valores: talla, sabor, cantidad. */
  options?: { name: string; values: string[] }[];
  variants?: ProductVariantInput[];
  /** URLs accesibles: Shopify las descarga él mismo. */
  images?: { url: string; alt: string }[];
}

export interface SavedProduct {
  id: string;
  handle: string;
  title: string;
  status: string;
  url: string;
}

const PRODUCT_FIELDS = `
  id
  handle
  title
  status
  vendor
  productType
  tags
  descriptionHtml
  options { id name values }
  variants(first: 100) {
    nodes { id title sku price compareAtPrice }
  }
  media(first: 20) {
    nodes { ... on MediaImage { id alt image { url } } }
  }
`;

function assertNoUserErrors(errors: { field?: string[] | null; message: string }[] | undefined) {
  if (!errors?.length) return;

  throw new Error(
    errors.map((item) => `${item.field?.join(".") ?? ""} ${item.message}`.trim()).join("; "),
  );
}

export interface ListedProduct {
  id: string;
  handle: string;
  title: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  descriptionHtml: string;
  options: { id: string; name: string; values: string[] }[];
  variants: { id: string; title: string; sku: string; price: number; compareAtPrice: number | null }[];
  images: { id: string; url: string; alt: string }[];
}

function toProduct(node: {
  id: string;
  handle: string;
  title: string;
  status: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  descriptionHtml?: string;
  options?: { id: string; name: string; values: string[] }[];
  variants?: {
    nodes: { id: string; title: string; sku?: string; price: string; compareAtPrice?: string | null }[];
  };
  media?: { nodes: ({ id: string; alt?: string; image?: { url: string } | null } | null)[] };
}): ListedProduct {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    status: node.status,
    vendor: node.vendor ?? "",
    productType: node.productType ?? "",
    tags: node.tags ?? [],
    descriptionHtml: node.descriptionHtml ?? "",
    options: node.options ?? [],
    variants: (node.variants?.nodes ?? []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku ?? "",
      price: Number(variant.price) || 0,
      compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
    })),
    images: (node.media?.nodes ?? [])
      .filter((item): item is { id: string; alt?: string; image?: { url: string } | null } =>
        Boolean(item?.image?.url),
      )
      .map((item) => ({ id: item.id, url: item.image!.url, alt: item.alt ?? "" })),
  };
}

/** Los productos de la tienda, paginados. */
export async function listShopProducts(
  store: Store,
  options: { search?: string; limit?: number } = {},
): Promise<ListedProduct[]> {
  const limit = Math.min(options.limit ?? 50, 250);

  const data = await shopifyGraphql<{
    products: { nodes: Parameters<typeof toProduct>[0][] };
  }>(
    store,
    `query productos($first: Int!, $query: String) {
      products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        nodes { ${PRODUCT_FIELDS} }
      }
    }`,
    { first: limit, query: options.search || null },
  );

  return data.products.nodes.map(toProduct);
}

export async function readShopProduct(store: Store, id: string): Promise<ListedProduct | null> {
  const data = await shopifyGraphql<{ product: Parameters<typeof toProduct>[0] | null }>(
    store,
    `query producto($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`,
    { id },
  );

  return data.product ? toProduct(data.product) : null;
}

/**
 * Crea o actualiza un producto entero, con sus variantes y sus imágenes.
 *
 * **Los campos de lista se reemplazan enteros.** Mandar dos variantes cuando el
 * producto tiene cinco borra las otras tres. Quien llama tiene que mandar la
 * lista completa; `listShopProducts` la devuelve tal cual para eso.
 */
export async function saveShopProduct(
  store: Store,
  input: ProductInput,
): Promise<SavedProduct> {
  const domain = (store.shopifyShopDomain || store.domain).replace(/^https?:\/\//, "");

  const product: Record<string, unknown> = {
    title: input.title,
    ...(input.id ? { id: input.id } : {}),
    ...(input.descriptionHtml !== undefined ? { descriptionHtml: input.descriptionHtml } : {}),
    ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
    ...(input.productType !== undefined ? { productType: input.productType } : {}),
    ...(input.handle ? { handle: input.handle } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.options
      ? {
          productOptions: input.options.map((option) => ({
            name: option.name,
            values: option.values.map((value) => ({ name: value })),
          })),
        }
      : {}),
    ...(input.variants
      ? {
          variants: input.variants.map((variant) => ({
            ...(variant.id ? { id: variant.id } : {}),
            price: variant.price.toFixed(2),
            ...(variant.compareAtPrice
              ? { compareAtPrice: variant.compareAtPrice.toFixed(2) }
              : {}),
            ...(variant.sku ? { sku: variant.sku } : {}),
            ...(variant.optionValues
              ? {
                  optionValues: variant.optionValues.map((value) => ({
                    name: value.name,
                    optionName: value.optionName,
                  })),
                }
              : {}),
          })),
        }
      : {}),
    ...(input.images
      ? {
          files: input.images.map((image) => ({
            originalSource: image.url,
            alt: image.alt,
            contentType: "IMAGE",
          })),
        }
      : {}),
  };

  const data = await shopifyGraphql<{
    productSet: {
      product: { id: string; handle: string; title: string; status: string } | null;
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(
    store,
    `mutation guardar($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product { id handle title status }
        userErrors { field message }
      }
    }`,
    { input: product },
  );

  assertNoUserErrors(data.productSet.userErrors);
  const saved = data.productSet.product;
  if (!saved) throw new Error("Shopify no devolvió el producto guardado.");

  return {
    id: saved.id,
    handle: saved.handle,
    title: saved.title,
    status: saved.status,
    url: `https://${domain}/products/${saved.handle}`,
  };
}

export async function deleteShopProduct(store: Store, id: string): Promise<void> {
  const data = await shopifyGraphql<{
    productDelete: { deletedProductId: string | null; userErrors: { message: string }[] };
  }>(
    store,
    `mutation borrar($input: ProductDeleteInput!) {
      productDelete(input: $input) { deletedProductId userErrors { field message } }
    }`,
    { input: { id } },
  );

  assertNoUserErrors(data.productDelete.userErrors);
}

/* ---------------------------------- Tema ----------------------------------- */

export interface ShopTheme {
  id: string;
  name: string;
  /** `MAIN` es el que ven los clientes. */
  role: string;
}

export async function listThemes(store: Store): Promise<ShopTheme[]> {
  const data = await shopifyGraphql<{
    themes: { nodes: { id: string; name: string; role: string }[] };
  }>(store, `query { themes(first: 20) { nodes { id name role } } }`);

  return data.themes.nodes;
}

export interface ThemeFile {
  filename: string;
  /** El contenido, cuando es texto. Los binarios vienen sin él. */
  body: string | null;
  size: number;
}

/**
 * Los archivos de un tema.
 *
 * Se filtra por nombre porque un tema tiene cientos y traerlos todos con su
 * contenido es una respuesta enorme que casi nunca hace falta. Los que
 * normalmente se tocan son `sections/`, `templates/` y `config/`.
 */
export async function listThemeFiles(
  store: Store,
  themeId: string,
  filenames?: string[],
): Promise<ThemeFile[]> {
  const data = await shopifyGraphql<{
    theme: {
      files: {
        nodes: {
          filename: string;
          size: number;
          body: { content?: string; contentBase64?: string } | null;
        }[];
      };
    } | null;
  }>(
    store,
    `query archivos($id: ID!, $filenames: [String!]) {
      theme(id: $id) {
        files(first: 250, filenames: $filenames) {
          nodes {
            filename
            size
            body {
              ... on OnlineStoreThemeFileBodyText { content }
              ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
            }
          }
        }
      }
    }`,
    { id: themeId, filenames: filenames?.length ? filenames : null },
  );

  if (!data.theme) throw new Error("Ese tema ya no existe.");

  return data.theme.files.nodes.map((file) => ({
    filename: file.filename,
    body: file.body?.content ?? null,
    size: file.size,
  }));
}

/**
 * Escribe archivos del tema.
 *
 * **Necesita algo más que el permiso.** `themeFilesUpsert` exige `write_themes`
 * y, además, una **exención que Shopify concede a mano** por formulario. Sin
 * ella la llamada falla con un error de acceso que no explica que el problema
 * sea ese, así que se traduce aquí.
 *
 * El tope de cincuenta archivos por llamada es de Shopify. Se trocea en vez de
 * fallar: quien edita una sección suele tocar dos archivos, pero un cambio de
 * plantilla completa puede pasar de cincuenta.
 */
export async function writeThemeFiles(
  store: Store,
  themeId: string,
  files: { filename: string; content: string }[],
): Promise<number> {
  let written = 0;

  for (let index = 0; index < files.length; index += 50) {
    const batch = files.slice(index, index + 50);

    try {
      const data = await shopifyGraphql<{
        themeFilesUpsert: {
          upsertedThemeFiles: { filename: string }[] | null;
          userErrors: { field?: string[] | null; message: string }[];
        };
      }>(
        store,
        `mutation escribir($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
          themeFilesUpsert(themeId: $themeId, files: $files) {
            upsertedThemeFiles { filename }
            userErrors { field message }
          }
        }`,
        {
          themeId,
          files: batch.map((file) => ({
            filename: file.filename,
            body: { type: "TEXT", value: file.content },
          })),
        },
      );

      assertNoUserErrors(data.themeFilesUpsert.userErrors);
      written += data.themeFilesUpsert.upsertedThemeFiles?.length ?? 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (/access|denied|scope|not approved|exemption/i.test(message)) {
        throw new Error(
          "Shopify no deja escribir en el tema. Los permisos de tema son dos y van en filas distintas del panel de la app: `write_themes` bajo «Theme templates» y **`write_theme_code` bajo «Theme Code»**, que viene desmarcado. Márcalo allí y vuelve a conectar la tienda. Si aun así falla, es que hace falta la exención que Shopify concede a mano para modificar archivos de tema; mientras tanto se puede leer el tema y gestionar productos.",
        );
      }

      throw error;
    }
  }

  return written;
}
