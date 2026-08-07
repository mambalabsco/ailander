import "server-only";

import { record, requireCapability } from "@/lib/permissions";

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
 * ## Los permisos de tema son dos, y basta con marcarlos
 *
 * En el panel de la app van en filas separadas: `read_themes` y `write_themes`
 * bajo «Theme templates», y **`write_theme_code` bajo «Theme Code»**, que viene
 * desmarcado.
 *
 * La documentación de `themeFilesUpsert` dice que hace falta `write_themes`
 * «más una exención de Shopify». **Probado contra una tienda real el 31 de julio
 * de 2026: no hace falta ninguna exención.** Con `write_theme_code` marcado en
 * el panel y la tienda reconectada, escribir, leer y borrar archivos de tema
 * funciona. Se verificó sobre un tema sin publicar y se limpió después.
 *
 * Se deja escrito porque la documentación sigue diciendo lo otro, y quien lea
 * esto después se ahorra el rodeo del formulario.
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
 * Funciona con `write_theme_code` marcado en el panel de la app y la tienda
 * reconectada — sin exención, pese a lo que dice la documentación. Ver la
 * cabecera de este archivo.
 *
 * El tope de cincuenta archivos por llamada es de Shopify. Se trocea en vez de
 * fallar: quien edita una sección suele tocar dos archivos, pero un cambio de
 * plantilla completa puede pasar de cincuenta.
 */
/**
 * Escribe archivos y devuelve **cuáles fallaron**, en vez de tirar la tanda.
 *
 * Shopify valida el lote entero: si un solo archivo tiene un esquema que no le
 * gusta, rechaza los doce y devuelve una lista de mensajes que nombran ajustes
 * —`setting with id="badge_url"`— sin decir en qué archivo están. Con eso no se
 * puede ni arreglar ni saber qué se salvó.
 *
 * Así que al fallar se escriben **uno a uno**. Son unas cuantas llamadas más,
 * pero solo por el camino del error, y a cambio se sabe exactamente cuál falla y
 * los demás sí se guardan. Una página con once secciones de doce se completa a
 * mano; una con cero hay que volver a lanzarla entera.
 */
export async function writeThemeFilesLenient(
  store: Store,
  themeId: string,
  files: { filename: string; content: string }[],
): Promise<{ written: number; failed: { filename: string; reason: string }[] }> {
  try {
    const written = await writeThemeFiles(store, themeId, files);
    return { written, failed: [] };
  } catch (firstError) {
    // Un fallo de permisos no mejora escribiendo de uno en uno: sería repetir el
    // mismo rechazo doce veces y tardar doce veces más en decir lo mismo.
    const message = firstError instanceof Error ? firstError.message : "";
    if (/write_theme_code|access|denied|scope/i.test(message)) throw firstError;

    let written = 0;
    const failed: { filename: string; reason: string }[] = [];

    for (const file of files) {
      try {
        written += await writeThemeFiles(store, themeId, [file]);
      } catch (error) {
        failed.push({
          filename: file.filename,
          reason: error instanceof Error ? error.message : "no se pudo escribir",
        });
      }
    }

    return { written, failed };
  }
}

export async function writeThemeFiles(
  store: Store,
  themeId: string,
  files: { filename: string; content: string }[],
): Promise<number> {
  /*
   * Escribir en un tema es lo que ven los clientes en cuanto se guarda.
   *
   * Se exige el permiso aquí, pegado a la llamada, y no en el botón: ocultar el
   * botón no impide llamar a la acción de servidor. Y queda anotado, porque
   * cuando algo sale mal la pregunta es siempre quién y cuándo.
   */
  await requireCapability("publicar");
  await record("tema.escribir", `${store.shopifyShopDomain ?? store.name} · ${themeId}`, {
    archivos: files.map((file) => file.filename),
  });

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
        /*
         * El mensaje de Shopify va **detrás**, no se sustituye.
         *
         * Antes esto afirmaba que faltaba el permiso, y con el permiso ya
         * marcado mandaba a mirar donde no era. Sigue siendo la causa más
         * común, y la segunda es que el token se emitiera antes de marcarlo
         * —los permisos viajan dentro del token y no se actualizan solos— pero
         * afirmar una tapa las demás.
         */
        throw new Error(
          `Shopify no deja escribir en el tema: ${message.slice(0, 200)}. Lo habitual es que falte «write_theme_code» —va en su propia fila del panel de la app, «Theme Code», y viene desmarcada—, o que esté marcada pero la tienda se conectara antes: los permisos viajan dentro del token, así que hay que volver a conectarla para que los recoja.`,
        );
      }

      throw error;
    }
  }

  return written;
}
