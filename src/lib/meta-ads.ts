import "server-only";

/**
 * Gasto publicitario de Meta.
 *
 * Verificado contra la documentación de la Marketing API v26.0 (la vigente),
 * no deducido: el nodo `AdAccount` da `account_id`, `name`, `currency`,
 * `account_status` y `timezone_name`; la arista `insights` acepta `level`,
 * `time_range`, `time_increment` y `filtering`.
 *
 * ## De dónde sale el token
 *
 * De iniciar sesión: el flujo está en `meta-oauth.ts` y aquí solo se usa el
 * resultado. Este archivo no sabe nada de autorización a propósito —lee gasto y
 * nada más—, y esa separación es lo que permite probar el uno sin el otro.
 *
 * Dura unos sesenta días, que es el máximo que da Meta para un token de usuario.
 * Quien llama se encarga de la caducidad; ver `meta-oauth.ts`.
 *
 * ## Lo que este archivo se niega a hacer
 *
 * No convierte monedas. Si la cuenta publicitaria liquida en dólares y la tienda
 * en pesos, el gasto se guarda en dólares con su moneda al lado y la interfaz lo
 * dice. Aplicar un tipo de cambio de hoy a un gasto de marzo daría un beneficio
 * que parece exacto y no lo es.
 */

const DEFAULT_VERSION = "v26.0";

/** Se puede fijar otra versión sin tocar código si Meta rompe algo. */
function version(): string {
  return process.env.META_API_VERSION?.trim() || DEFAULT_VERSION;
}

const GRAPH = "https://graph.facebook.com";

export interface MetaAccount {
  /** Sin el prefijo `act_`. */
  externalId: string;
  name: string;
  currency: string;
  /** 1 es activa; el resto son grados de «no va a gastar». */
  status: number;
  timeZone: string;
  /** De qué Business Manager cuelga. Vacío en las cuentas personales. */
  businessId: string;
  businessName: string;
}

export interface MetaDailySpend {
  day: string;
  campaignRef: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reportedPurchases: number;
  reportedValue: number;
  currency: string;
}

interface GraphError {
  error?: { message: string; type?: string; code?: number; error_subcode?: number };
}

/**
 * Traduce los errores de Meta a algo que se pueda leer y actuar.
 *
 * Los códigos importan: el 190 es «el permiso ya no sirve» y el 17 es «has pedido
 * demasiado». Son dos problemas opuestos —uno se arregla volviendo a iniciar
 * sesión, el otro esperando— y el mensaje crudo de Meta no distingue bien entre
 * ellos.
 */
function describeError(payload: GraphError, status: number): string {
  const error = payload.error;
  if (!error) return `Meta respondió ${status}.`;

  if (error.code === 190) {
    return "Meta rechazó el permiso: caducó o se revocó. Vuelve a iniciar sesión con Facebook en Datos → Conexiones.";
  }
  if (error.code === 17 || error.code === 4 || error.code === 613) {
    return "Meta está limitando las peticiones. Espera unos minutos y vuelve a sincronizar: el gasto ya guardado no se pierde.";
  }
  if (error.code === 200 || error.code === 10) {
    return "La cuenta que inició sesión no tiene permiso para ver esa cuenta publicitaria. Dale acceso en el Business Manager, o desactívala en Conexiones.";
  }
  if (error.code === 803) {
    return "Esa cuenta publicitaria no existe o el token no la ve.";
  }

  return `Meta: ${error.message}`;
}

async function call<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${version()}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as T & GraphError;

  if (!response.ok || payload.error) {
    throw new Error(describeError(payload, response.status));
  }

  return payload;
}

/* -------------------------------- Cuentas --------------------------------- */

/**
 * Las cuentas publicitarias que el token puede ver.
 *
 * Se listan todas, incluidas las desactivadas: quien busca por qué falta el
 * gasto de marzo necesita ver la cuenta que se cerró en abril.
 */
export async function listAccounts(token: string): Promise<MetaAccount[]> {
  const accounts: MetaAccount[] = [];
  let after: string | null = null;

  do {
    const data: {
      data: {
        account_id: string;
        name?: string;
        currency?: string;
        account_status?: number;
        timezone_name?: string;
        business?: { id?: string; name?: string };
      }[];
      paging?: { cursors?: { after?: string }; next?: string };
    } = await call("me/adaccounts", token, {
      /*
       * `business` viene en el propio nodo de la cuenta, así que no cuesta una
       * llamada más. Sin él la lista es plana, y con dos Business Manager que
       * tengan cada uno una «Naturox MX» no hay forma de saber cuál se activa.
       */
      fields: "account_id,name,currency,account_status,timezone_name,business{id,name}",
      limit: "100",
      ...(after ? { after } : {}),
    });

    for (const item of data.data) {
      accounts.push({
        externalId: item.account_id,
        name: item.name ?? item.account_id,
        currency: item.currency ?? "USD",
        status: item.account_status ?? 0,
        timeZone: item.timezone_name ?? "",
        // Vacío cuando la cuenta no cuelga de ningún Business Manager, que es
        // el caso de las personales antiguas.
        businessId: item.business?.id ?? "",
        businessName: item.business?.name ?? "",
      });
    }

    // `next` es lo que dice si hay más; el cursor solo, no. Una cuenta con
    // exactamente cien accesos daría un cursor y ninguna página siguiente.
    after = data.paging?.next ? (data.paging.cursors?.after ?? null) : null;
  } while (after);

  return accounts;
}

/* ------------------------------- Conversiones ------------------------------ */

/**
 * Compras y valor que **declara** Meta.
 *
 * No se usan para calcular el beneficio —para eso están los pedidos de Shopify,
 * que son dinero cobrado— pero se guardan porque la diferencia entre las dos
 * cifras es en sí un diagnóstico: cuando Meta declara el doble de ventas que las
 * que hay en la tienda, lo que está mal es la ventana de atribución.
 *
 * `omni_purchase` gana cuando existe: es el agregado de Meta y sumar además el
 * del pixel y el de dentro de Facebook contaría la misma compra dos y tres
 * veces, que es el error clásico al leer este campo.
 */
const PIXEL_PURCHASE = "offsite_conversion.fb_pixel_purchase";
const ONSITE_PURCHASE = "onsite_conversion.purchase";

function purchasesFrom(stats: { action_type: string; value: string }[] | undefined): number {
  if (!stats?.length) return 0;

  const omni = stats.find((item) => item.action_type === "omni_purchase");
  if (omni) return Number(omni.value) || 0;

  return stats
    .filter((item) => item.action_type === PIXEL_PURCHASE || item.action_type === ONSITE_PURCHASE)
    .reduce((sum, item) => sum + (Number(item.value) || 0), 0);
}

/* --------------------------------- Gasto ---------------------------------- */

/**
 * Gasto diario por campaña de una cuenta, en un rango.
 *
 * `time_increment=1` es lo que hace que devuelva una fila por día en vez de un
 * único total del periodo. Sin él habría que llamar una vez por día, y noventa
 * llamadas para tres meses agotan el cupo enseguida.
 *
 * **El día es el de la zona horaria de la cuenta publicitaria**, no de la
 * tienda. Cuando no coinciden, una parte del gasto de cada noche cae en el día
 * anterior o el siguiente que las ventas, y el ROAS diario se descuadra sin que
 * nada avise. Por eso `listAccounts` trae `timezone_name` y la interfaz lo
 * compara con el de la tienda.
 */
export async function readDailySpend(
  token: string,
  externalId: string,
  options: { from: string; to: string },
): Promise<MetaDailySpend[]> {
  const rows: MetaDailySpend[] = [];
  let after: string | null = null;

  do {
    const data: {
      data: {
        date_start: string;
        campaign_id?: string;
        campaign_name?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        account_currency?: string;
        actions?: { action_type: string; value: string }[];
        action_values?: { action_type: string; value: string }[];
      }[];
      paging?: { cursors?: { after?: string }; next?: string };
    } = await call(`act_${externalId}/insights`, token, {
      level: "campaign",
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,account_currency,actions,action_values",
      time_range: JSON.stringify({ since: options.from, until: options.to }),
      time_increment: "1",
      limit: "500",
      ...(after ? { after } : {}),
    });

    for (const item of data.data) {
      rows.push({
        day: item.date_start,
        campaignRef: item.campaign_id ?? "",
        campaignName: item.campaign_name ?? "",
        spend: Number(item.spend) || 0,
        impressions: Number(item.impressions) || 0,
        clicks: Number(item.clicks) || 0,
        reportedPurchases: purchasesFrom(item.actions),
        reportedValue: purchasesFrom(item.action_values),
        currency: item.account_currency ?? "USD",
      });
    }

    after = data.paging?.next ? (data.paging.cursors?.after ?? null) : null;
  } while (after);

  return rows;
}

/* -------------------------------- Filtros --------------------------------- */

/**
 * Filtra el gasto por nombre de campaña.
 *
 * Existe porque una cuenta publicitaria casi nunca es de una sola tienda: la
 * misma cuenta lleva campañas de México, de Chile y de un producto que ya no se
 * vende. Sin filtrar, el gasto de todas ellas se restaría del beneficio de una
 * tienda que no las pagó, y el número resultante sería peor que no tener número.
 *
 * Primero se incluye y después se excluye. Ese orden permite «todo lo de México
 * menos la campaña vieja» con dos reglas en vez de veinte, que es la forma en
 * que la gente piensa estos filtros.
 *
 * Coincidencia por subcadena y sin distinguir mayúsculas: los nombres de campaña
 * son cosas como `220326_EN_US_TESTCREPEY - Copia`, y pedir la cadena exacta
 * obligaría a mantener el filtro cada vez que alguien duplica una campaña.
 */
export function matchesFilters(
  campaignName: string,
  include: string[],
  exclude: string[],
): boolean {
  const name = campaignName.toLowerCase();
  const clean = (list: string[]) =>
    list.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0);

  const includes = clean(include);
  const excludes = clean(exclude);

  if (includes.length > 0 && !includes.some((item) => name.includes(item))) return false;
  if (excludes.some((item) => name.includes(item))) return false;

  return true;
}
