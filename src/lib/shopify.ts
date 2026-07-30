import "server-only";

import type { Store } from "@/types/store";

/**
 * Cliente de la Admin API de Shopify.
 *
 * **Todo lo de aquí está verificado contra la documentación de la versión
 * 2026-07**, no deducido:
 *
 * - `pageCreate` y `pageUpdate` existen y piden `write_content` o
 *   `write_online_store_pages`.
 * - `fileCreate` **acepta una URL externa accesible en `originalSource`** y
 *   descarga el archivo él mismo. Eso ahorra el flujo de subida en dos pasos:
 *   basta con darle la URL firmada de Supabase, que vive una hora — de sobra.
 * - La subida es **asíncrona**: el archivo nace en `UPLOADED` y hay que esperar
 *   a `READY` para que exista su URL de CDN. Pedirla antes devuelve nulo, y esa
 *   es la trampa que dejaría páginas publicadas con las imágenes vacías.
 *
 * Se usa una app **personalizada** de la propia tienda: se crea en Ajustes →
 * Apps → Desarrollar apps, no pasa por revisión de Shopify y no es pública.
 *
 * **Las credenciales son de cada tienda, no de la cuenta.** Quien lleva Naturox
 * México y Naturox Chile tiene dos apps distintas en dos tiendas distintas: un
 * único token global publicaría siempre en la equivocada.
 */

const API_VERSION = "2026-07";

interface ShopifyCredentials {
  domain: string;
  token: string;
}

function credentials(store: Store): ShopifyCredentials {
  if (!store.shopifyAdminToken) {
    throw new Error(
      `La tienda «${store.name}» no tiene token de Shopify. Añádelo en Tiendas: crea una app personalizada con permisos write_content y write_files, y pega su token de Admin API.`,
    );
  }

  /*
   * **El `.myshopify.com`, no el dominio propio.**
   *
   * La Admin API solo responde en el primero; con `naturoxchile.com` devuelve
   * 404 «Not Found», que se lee como un problema de permisos y no lo es. El
   * dominio propio sigue sirviendo para los enlaces de cara al público.
   */
  const raw = store.shopifyShopDomain || store.domain;
  const domain = raw
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!domain) throw new Error(`La tienda «${store.name}» no tiene dominio.`);

  if (!domain.endsWith(".myshopify.com")) {
    throw new Error(
      `Falta el dominio .myshopify.com de «${store.name}». Vuelve a conectarla en Tiendas: la Admin API no responde en el dominio propio.`,
    );
  }

  return { domain, token: store.shopifyAdminToken.trim() };
}

interface GraphqlError {
  message: string;
}

/**
 * Se exporta para `shopify-orders.ts`, que necesita el mismo cliente.
 *
 * Vive aquí y no allí porque toda la lógica frágil de credenciales —el
 * `.myshopify.com`, la traducción del 401— es la misma para cualquier consulta,
 * y duplicarla garantizaría que una de las dos copias se quedase atrás.
 */
export async function shopifyGraphql<T>(
  store: Store,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  return graphql<T>(store, query, variables);
}

async function graphql<T>(
  store: Store,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const { domain, token } = credentials(store);

  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Shopify rechazó el token. Comprueba que la app personalizada tenga los permisos write_content y write_files, y que el token sea el de acceso de Admin API.",
    );
  }

  if (!response.ok) {
    throw new Error(`Shopify respondió ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: T; errors?: GraphqlError[] };

  if (payload.errors?.length) {
    throw new Error(`Shopify: ${payload.errors.map((item) => item.message).join("; ")}`);
  }
  if (!payload.data) throw new Error("Shopify no devolvió datos.");

  return payload.data;
}

/** Los errores de validación no viajan como error HTTP, sino dentro de la respuesta. */
function assertNoUserErrors(errors: { field?: string[] | null; message: string }[] | undefined) {
  if (!errors?.length) return;

  throw new Error(
    errors.map((item) => `${item.field?.join(".") ?? ""} ${item.message}`.trim()).join("; "),
  );
}

/* --------------------------------- Archivos ------------------------------------ */

export interface UploadedFile {
  id: string;
  url: string;
}

/**
 * Sube imágenes desde sus URLs y espera a que Shopify las tenga listas.
 *
 * Shopify las descarga de la URL que se le pasa, así que sirven las firmadas de
 * Supabase. Lo que **no** se puede saltar es la espera: el archivo nace en
 * `UPLOADED` y su URL de CDN no existe hasta `READY`. Publicar sin esperar daría
 * una página con los huecos vacíos.
 */
export async function uploadImages(
  store: Store,
  images: { url: string; alt: string }[],
): Promise<Map<string, UploadedFile>> {
  if (images.length === 0) return new Map();

  const created = await graphql<{
    fileCreate: {
      files: { id: string; fileStatus: string }[];
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(
    store,
    `mutation subir($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus }
        userErrors { field message }
      }
    }`,
    {
      files: images.map((image) => ({
        originalSource: image.url,
        alt: image.alt,
        contentType: "IMAGE",
      })),
    },
  );

  assertNoUserErrors(created.fileCreate.userErrors);

  const ids = created.fileCreate.files.map((file) => file.id);
  const ready = await waitForFiles(store, ids);

  // Se devuelve indexado por la URL de origen para que quien llamó sepa cuál es
  // cuál: `fileCreate` respeta el orden de entrada.
  const result = new Map<string, UploadedFile>();
  ids.forEach((id, index) => {
    const url = ready.get(id);
    if (url) result.set(images[index].url, { id, url });
  });

  return result;
}

/** Sondea hasta que los archivos están listos. Devuelve id → URL de CDN. */
async function waitForFiles(
  store: Store,
  ids: string[],
  timeoutMs = 90_000,
): Promise<Map<string, string>> {
  const pending = new Set(ids);
  const urls = new Map<string, string>();
  const deadline = Date.now() + timeoutMs;
  let wait = 1_500;

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    // Sube poco a poco: una imagen suele estar en dos o tres segundos, y
    // preguntar cada medio segundo durante un minuto solo añade ruido.
    wait = Math.min(wait * 1.4, 6_000);

    const data = await graphql<{
      nodes: ({ id: string; fileStatus: string; image?: { url: string } | null } | null)[];
    }>(
      store,
      `query estado($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on MediaImage { id fileStatus image { url } }
        }
      }`,
      { ids: [...pending] },
    );

    for (const node of data.nodes) {
      if (!node) continue;

      if (node.fileStatus === "READY" && node.image?.url) {
        urls.set(node.id, node.image.url);
        pending.delete(node.id);
      } else if (node.fileStatus === "FAILED") {
        pending.delete(node.id);
      }
    }
  }

  return urls;
}

/* --------------------------------- Páginas -------------------------------------- */

export interface PublishedPage {
  id: string;
  handle: string;
  url: string;
}

export async function createPage(
  store: Store,
  input: { title: string; handle: string; body: string; published: boolean },
): Promise<PublishedPage> {
  const { domain } = credentials(store);

  const data = await graphql<{
    pageCreate: {
      page: { id: string; handle: string } | null;
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(
    store,
    `mutation crear($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    {
      page: {
        title: input.title,
        handle: input.handle,
        body: input.body,
        isPublished: input.published,
      },
    },
  );

  assertNoUserErrors(data.pageCreate.userErrors);
  const page = data.pageCreate.page;
  if (!page) throw new Error("Shopify no devolvió la página creada.");

  return { id: page.id, handle: page.handle, url: `https://${domain}/pages/${page.handle}` };
}

/**
 * Actualiza una página ya publicada.
 *
 * Republicar **actualiza en vez de duplicar**: sin esto, cada corrección dejaría
 * otra página con un sufijo en el enlace, y los anuncios que ya apuntan a la
 * primera se quedarían con la versión vieja.
 */
export async function updatePage(
  store: Store,
  id: string,
  input: { title: string; body: string; published: boolean },
): Promise<PublishedPage> {
  const { domain } = credentials(store);

  const data = await graphql<{
    pageUpdate: {
      page: { id: string; handle: string } | null;
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(
    store,
    `mutation actualizar($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    {
      id,
      page: { title: input.title, body: input.body, isPublished: input.published },
    },
  );

  assertNoUserErrors(data.pageUpdate.userErrors);
  const page = data.pageUpdate.page;
  if (!page) throw new Error("Shopify no devolvió la página actualizada.");

  return { id: page.id, handle: page.handle, url: `https://${domain}/pages/${page.handle}` };
}

/** Comprueba que las credenciales sirven, antes de intentar publicar nada. */
export async function checkShopifyAccess(
  store: Store,
): Promise<{ ok: boolean; shop?: string; reason?: string }> {
  try {
    const data = await graphql<{ shop: { name: string } }>(store, `query { shop { name } }`, {});
    return { ok: true, shop: data.shop.name };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "No se pudo conectar." };
  }
}

/* -------------------------------- Atribución ------------------------------------ */

export interface AttributedOrder {
  id: string;
  createdAt: string;
  total: number;
  currency: string;
  /** La ruta de la página por la que entró: `/pages/dr-revela`. */
  landingPath: string | null;
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
}

/**
 * Los pedidos con la página y el anuncio por los que entró cada uno.
 *
 * **Sin pixel y sin cookies.** Shopify guarda la primera visita del cliente con
 * su página de aterrizaje y sus parámetros UTM, y lo hace en su servidor: no lo
 * bloquea ningún bloqueador de anuncios, que se lleva por delante entre el 15% y
 * el 30% de lo que mediría un pixel — y justo el tráfico más rentable.
 *
 * Se mira `firstVisit` y no `lastVisit`: la landing es lo que **abrió** la
 * relación. Atribuir al último clic daría el mérito a la página de producto que
 * el cliente visitó justo antes de comprar, que no es la que hizo el trabajo.
 *
 * **Shopify solo da los últimos 60 días** salvo que pidas acceso ampliado; para
 * decidir entre landings es de sobra.
 */
export async function readAttributedOrders(
  store: Store,
  options: { since: Date; limit?: number },
): Promise<AttributedOrder[]> {
  const orders: AttributedOrder[] = [];
  let cursor: string | null = null;
  const limit = options.limit ?? 500;

  // Paginado: una tienda con volumen supera de largo los 250 por página.
  while (orders.length < limit) {
    const data: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          createdAt: string;
          currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
          customerJourneySummary: {
            firstVisit: {
              landingPage: string | null;
              utmParameters: {
                source: string | null;
                medium: string | null;
                campaign: string | null;
                content: string | null;
                term: string | null;
              } | null;
            } | null;
          } | null;
        }[];
      };
    } = await graphql(
      store,
      `query pedidos($cursor: String, $query: String!) {
        orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            createdAt
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            customerJourneySummary {
              firstVisit {
                landingPage
                utmParameters { source medium campaign content term }
              }
            }
          }
        }
      }`,
      { cursor, query: `created_at:>=${options.since.toISOString().slice(0, 10)}` },
    );

    for (const node of data.orders.nodes) {
      const visit = node.customerJourneySummary?.firstVisit;
      const utm = visit?.utmParameters;

      orders.push({
        id: node.id,
        createdAt: node.createdAt,
        total: Number(node.currentTotalPriceSet.shopMoney.amount),
        currency: node.currentTotalPriceSet.shopMoney.currencyCode,
        landingPath: visit?.landingPage ? pathOf(visit.landingPage) : null,
        utm: {
          source: utm?.source ?? undefined,
          medium: utm?.medium ?? undefined,
          campaign: utm?.campaign ?? undefined,
          content: utm?.content ?? undefined,
          term: utm?.term ?? undefined,
        },
      });
    }

    if (!data.orders.pageInfo.hasNextPage || !data.orders.pageInfo.endCursor) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  return orders;
}

/** Solo la ruta: la URL trae dominio y parámetros que estorban al agrupar. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
