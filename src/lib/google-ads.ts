import "server-only";

/**
 * Gasto publicitario de Google Ads.
 *
 * Verificado contra la documentación REST de la v25 (la vigente): el punto final
 * es `POST /v25/customers/{id}/googleAds:searchStream`, las cabeceras
 * obligatorias son `Authorization: Bearer` y `developer-token`, y las cuentas
 * accesibles se listan en `GET /v25/customers:listAccessibleCustomers`.
 *
 * ## Iniciar sesión no basta aquí
 *
 * El *refresh token* sale del login —está en `google-oauth.ts`— y es permanente,
 * así que esa parte se resuelve con un botón. Pero Google Ads además **no
 * responde sin un developer token**, y ese no lo da ningún flujo de OAuth: se
 * solicita en el API Center de la cuenta administradora y lo aprueba una persona.
 *
 * Por eso una conexión de Google puede estar autorizada y a la vez inservible, y
 * por eso la interfaz distingue los dos estados en vez de decir solo «conectado».
 *
 * Google tiene ahora un programa de «acceso gestionado desde la nube» que permite
 * omitir el developer token, pero **sigue exigiendo tener uno aprobado** antes de
 * entrar, así que no evita la espera. La cabecera se manda solo si está puesta:
 * así sirve en los dos escenarios sin cambiar nada.
 *
 * ## Por qué el token de acceso no se guarda
 *
 * Los de Google viven una hora. Guardarlos obligaría a comprobar su caducidad en
 * cada llamada y a manejar el caso de dos sincronizaciones renovándolo a la vez.
 * Pedir uno nuevo cuesta una petición y elimina toda esa clase de fallos.
 */

const DEFAULT_VERSION = "v25";

function version(): string {
  return process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_VERSION;
}

const BASE = "https://googleads.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Opcional con acceso gestionado desde la nube; obligatorio sin él. */
  developerToken?: string;
  /** La cuenta administradora desde la que se consulta. */
  loginCustomerId?: string;
}

export interface GoogleAccount {
  externalId: string;
  name: string;
  currency: string;
  timeZone: string;
}

export interface GoogleDailySpend {
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

/** Solo dígitos: Google los escribe con guiones y la API los rechaza así. */
function bareId(value: string): string {
  return value.replace(/\D/g, "");
}

/* --------------------------------- OAuth ---------------------------------- */

async function accessToken(credentials: GoogleCredentials): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    /*
     * `invalid_grant` es el error que se ve de verdad, y su mensaje crudo
     * —«Bad Request»— no ayuda a nadie. Significa que el refresh token dejó de
     * valer, y eso pasa por tres motivos concretos que conviene enumerar porque
     * el usuario no puede adivinarlos.
     */
    if (payload.error === "invalid_grant") {
      throw new Error(
        "Google rechazó el permiso guardado. Suele ser por una de tres cosas: se revocó el acceso, la aplicación sigue en modo de prueba (ahí caduca en siete días) o se cambió la contraseña de la cuenta. Hay que volver a autorizar.",
      );
    }
    throw new Error(
      `Google no dio un token de acceso: ${payload.error_description || payload.error || response.status}`,
    );
  }

  return payload.access_token;
}

function headersFor(credentials: GoogleCredentials, token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Con acceso gestionado desde la nube el servidor la ignora, así que mandarla
  // solo cuando existe funciona en los dos casos.
  if (credentials.developerToken) headers["developer-token"] = credentials.developerToken;
  if (credentials.loginCustomerId) {
    headers["login-customer-id"] = bareId(credentials.loginCustomerId);
  }

  return headers;
}

interface GoogleError {
  error?: {
    message?: string;
    status?: string;
    details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[];
  };
}

/**
 * Los errores útiles de Google vienen anidados tres niveles.
 *
 * El `error.message` de arriba dice «Request contains an invalid argument»
 * mientras el de dentro dice exactamente qué campo y por qué. Sacar el de dentro
 * es la diferencia entre un mensaje accionable y uno inútil.
 */
function describeError(payload: GoogleError, status: number): string {
  const inner = payload.error?.details?.[0]?.errors?.[0];
  if (inner?.message) return `Google Ads: ${inner.message}`;

  if (status === 401) {
    return "Google Ads rechazó las credenciales. Comprueba el developer token y que la cuenta administradora sea la correcta.";
  }
  if (status === 403) {
    return "Google Ads no autoriza esta consulta. Lo más habitual: el developer token todavía está en acceso de prueba, que solo funciona con cuentas de prueba.";
  }
  if (status === 429) {
    return "Google Ads está limitando las peticiones. Espera y vuelve a sincronizar.";
  }

  return payload.error?.message
    ? `Google Ads: ${payload.error.message}`
    : `Google Ads respondió ${status}.`;
}

/* -------------------------------- Consultas -------------------------------- */

interface StreamRow {
  campaign?: { id?: string; name?: string };
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
  };
}

/**
 * Ejecuta una consulta GAQL y devuelve las filas ya aplanadas.
 *
 * `searchStream` responde con un **array de trozos**, cada uno con su propia
 * lista `results`. Es la trampa de este punto final: tratar la respuesta como un
 * único objeto con `results` funciona en pruebas pequeñas y pierde silenciosamente
 * todo lo que no quepa en el primer trozo, así que el fallo aparece justo cuando
 * hay datos de verdad.
 */
async function query(
  credentials: GoogleCredentials,
  customerId: string,
  gaql: string,
): Promise<StreamRow[]> {
  const token = await accessToken(credentials);

  const response = await fetch(
    `${BASE}/${version()}/customers/${bareId(customerId)}/googleAds:searchStream`,
    {
      method: "POST",
      headers: headersFor(credentials, token),
      body: JSON.stringify({ query: gaql }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as ({ results?: StreamRow[] }[] & GoogleError) | GoogleError;

  if (!response.ok) throw new Error(describeError(payload as GoogleError, response.status));

  const chunks = Array.isArray(payload) ? payload : [];
  return chunks.flatMap((chunk) => chunk.results ?? []);
}

/* -------------------------------- Cuentas --------------------------------- */

/**
 * Las cuentas que las credenciales pueden ver.
 *
 * `listAccessibleCustomers` devuelve solo identificadores, sin nombre ni moneda,
 * así que hace falta una consulta más por cuenta. Se hacen en paralelo porque en
 * serie una cuenta administradora con veinte hijas tardaría demasiado, y una que
 * falle no debe tumbar la lista entera: se omite y las demás se devuelven.
 */
export async function listAccounts(credentials: GoogleCredentials): Promise<GoogleAccount[]> {
  const token = await accessToken(credentials);

  const response = await fetch(`${BASE}/${version()}/customers:listAccessibleCustomers`, {
    headers: headersFor(credentials, token),
    cache: "no-store",
  });

  const payload = (await response.json()) as { resourceNames?: string[] } & GoogleError;
  if (!response.ok) throw new Error(describeError(payload, response.status));

  const ids = (payload.resourceNames ?? []).map((name) => name.split("/").pop() ?? "");

  const results = await Promise.all(
    ids.filter(Boolean).map(async (id) => {
      try {
        const rows = await query(
          credentials,
          id,
          "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
        );
        const customer = rows[0]?.customer;
        return {
          externalId: id,
          name: customer?.descriptiveName || id,
          currency: customer?.currencyCode || "USD",
          timeZone: customer?.timeZone || "",
        };
      } catch {
        // Una cuenta cancelada o sin permiso de lectura no debe impedir ver el resto.
        return null;
      }
    }),
  );

  return results.filter((item): item is GoogleAccount => item !== null);
}

/* --------------------------------- Gasto ---------------------------------- */

/**
 * Gasto diario por campaña.
 *
 * `segments.date` en la cláusula `SELECT` es lo que parte el resultado por días;
 * sin él Google devuelve un único total del periodo. Y `cost_micros` está en
 * millonésimas de la moneda de la cuenta: el que olvida dividir ve un gasto un
 * millón de veces mayor, lo que al menos es un error difícil de pasar por alto.
 *
 * Se piden solo las campañas con impresiones. Una cuenta con doscientas campañas
 * pausadas devolvería miles de filas a cero que hay que descargar, guardar y
 * después ignorar.
 */
export async function readDailySpend(
  credentials: GoogleCredentials,
  externalId: string,
  options: { from: string; to: string },
): Promise<GoogleDailySpend[]> {
  const gaql = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${options.from}' AND '${options.to}'
      AND metrics.impressions > 0
  `;

  const rows = await query(credentials, externalId, gaql);

  return rows.map((row) => ({
    day: row.segments?.date ?? "",
    campaignRef: row.campaign?.id ?? "",
    campaignName: row.campaign?.name ?? "",
    spend: (Number(row.metrics?.costMicros) || 0) / 1_000_000,
    impressions: Number(row.metrics?.impressions) || 0,
    clicks: Number(row.metrics?.clicks) || 0,
    // Google devuelve conversiones con decimales porque las reparte entre
    // campañas; se redondea solo al contarlas, nunca al sumar su valor.
    reportedPurchases: Math.round(row.metrics?.conversions ?? 0),
    reportedValue: row.metrics?.conversionsValue ?? 0,
    currency: "",
  }));
}
