import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type {
  CostSettings,
  CustomCost,
  CustomCostBasis,
  CustomCostKind,
  CustomCostRepeat,
  GatewayFee,
  OrderInput,
  ShippingTier,
  ShippingZone,
  SpendInput,
} from "@/lib/profit";
import type { SyncedOrder } from "@/lib/shopify-orders";

/**
 * Lectura y escritura de todo lo que alimenta el beneficio real.
 *
 * **Los `numeric` de PostgreSQL llegan como texto.** Es la trampa que atraviesa
 * todo este archivo: tipearlos como número compila y después suma cadenas, así
 * que `«5.03» + «8.68»` da `«5.038.68»`. Cada importe pasa por `num()`, sin
 * excepciones.
 */

/** Un `numeric` que llega como texto, o un nulo, o algo raro. Siempre un número. */
function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* -------------------------------- Pedidos --------------------------------- */

export interface SaveOrdersResult {
  saved: number;
  lines: number;
}

/**
 * Guarda una tanda de pedidos con sus líneas.
 *
 * El pedido se inserta con `upsert` sobre `(store_id, shopify_ref)`, así que
 * volver a sincronizar un rango ya sincronizado **actualiza** en vez de duplicar.
 * Hace falta de verdad: un pedido cambia después de existir —se reembolsa, se
 * cierra, se marca como pagado— y la sincronización de ayer se queda vieja.
 *
 * Las líneas, en cambio, se borran y se vuelven a escribir. No tienen una clave
 * natural estable —Shopify puede quitar una línea de un pedido editado— y un
 * `upsert` dejaría vivas las que desaparecieron, inflando la mercancía de un
 * pedido que ya no las lleva.
 */
export async function saveOrders(
  storeId: string,
  orders: SyncedOrder[],
): Promise<SaveOrdersResult> {
  if (orders.length === 0) return { saved: 0, lines: 0 };

  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("shop_orders")
    .upsert(
      orders.map((order) => ({
        user_id: userId,
        store_id: storeId,
        shopify_ref: order.shopifyRef,
        name: order.name,
        processed_at: order.processedAt,
        currency: order.currency,
        gross_sales: order.grossSales.toFixed(2),
        discounts: order.discounts.toFixed(2),
        returns: order.returns.toFixed(2),
        taxes: order.taxes.toFixed(2),
        shipping_charged: order.shippingCharged.toFixed(2),
        tips: order.tips.toFixed(2),
        total: order.total.toFixed(2),
        gateway: order.gateway,
        financial_status: order.financialStatus,
        test: order.test,
        customer_ref: order.customerRef,
        is_first_order: order.isFirstOrder,
        landing_page: order.landingPage,
        utm: { ...order.utm, country: order.countryCode },
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "store_id,shopify_ref" },
    )
    .select("id, shopify_ref");

  if (error) throw new Error(`No se pudieron guardar los pedidos: ${error.message}`);

  const idByRef = new Map((data ?? []).map((row) => [row.shopify_ref, row.id]));

  await supabase
    .from("shop_order_items")
    .delete()
    .in("order_id", [...idByRef.values()]);

  const items = orders.flatMap((order) => {
    const orderId = idByRef.get(order.shopifyRef);
    if (!orderId) return [];

    return order.lines.map((line) => ({
      order_id: orderId,
      product_ref: line.productRef,
      variant_ref: line.variantRef,
      sku: line.sku,
      title: line.title,
      quantity: line.quantity,
      unit_price: line.unitPrice.toFixed(2),
      discount: line.discount.toFixed(2),
      refunded_quantity: line.refundedQuantity,
    }));
  });

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("shop_order_items").insert(items);
    if (itemsError) {
      throw new Error(`No se pudieron guardar las líneas: ${itemsError.message}`);
    }
  }

  return { saved: idByRef.size, lines: items.length };
}

/**
 * Los pedidos de un rango, en la forma que espera el motor.
 *
 * Se pide un día de más por cada lado y se recorta después en el motor. El motivo
 * es la zona horaria: un pedido de las 23:30 del día 31 en México está guardado
 * como del 1 a las 05:30 UTC, y filtrando por UTC exacto se quedaría fuera del
 * informe del mes al que pertenece.
 */
export async function readOrdersForRange(
  storeId: string,
  from: string,
  to: string,
): Promise<OrderInput[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("shop_orders")
    .select("*")
    .eq("store_id", storeId)
    .gte("processed_at", `${from}T00:00:00Z`)
    .lte("processed_at", `${to}T23:59:59Z`)
    .order("processed_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los pedidos: ${error.message}`);

  const orders = data ?? [];
  if (orders.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("shop_order_items")
    .select("*")
    .in(
      "order_id",
      orders.map((order) => order.id),
    );

  if (itemsError) throw new Error(`No se pudieron leer las líneas: ${itemsError.message}`);

  const linesByOrder = new Map<string, OrderInput["lines"]>();
  for (const item of items ?? []) {
    const list = linesByOrder.get(item.order_id) ?? [];
    list.push({
      productRef: item.product_ref,
      variantRef: item.variant_ref,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      unitPrice: num(item.unit_price),
      discount: num(item.discount),
      refundedQuantity: item.refunded_quantity,
    });
    linesByOrder.set(item.order_id, list);
  }

  return orders.map((order) => {
    const utm = (order.utm ?? {}) as Record<string, string>;

    return {
      id: order.id,
      name: order.name,
      processedAt: order.processed_at,
      currency: order.currency,
      grossSales: num(order.gross_sales),
      discounts: num(order.discounts),
      returns: num(order.returns),
      taxes: num(order.taxes),
      shippingCharged: num(order.shipping_charged),
      tips: num(order.tips),
      total: num(order.total),
      gateway: order.gateway,
      test: order.test,
      isFirstOrder: order.is_first_order,
      countryCode: utm.country ?? "",
      lines: linesByOrder.get(order.id) ?? [],
    };
  });
}

/** Fecha del pedido más reciente que ya está guardado, para sincronizar solo lo nuevo. */
export async function lastSyncedOrderDate(storeId: string): Promise<string | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("shop_orders")
    .select("processed_at")
    .eq("store_id", storeId)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.processed_at ?? null;
}

/** Pedidos con su atribución, para cruzar landings y anuncios con dinero cobrado. */
export interface OrderAttribution {
  id: string;
  name: string;
  processedAt: string;
  total: number;
  currency: string;
  landingPage: string;
  utm: Record<string, string>;
  isFirstOrder: boolean;
}

export async function readAttribution(
  storeId: string,
  from: string,
  to: string,
): Promise<OrderAttribution[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("shop_orders")
    .select("id, name, processed_at, total, currency, landing_page, utm, is_first_order, test")
    .eq("store_id", storeId)
    .eq("test", false)
    .gte("processed_at", `${from}T00:00:00Z`)
    .lte("processed_at", `${to}T23:59:59Z`);

  if (error) throw new Error(`No se pudo leer la atribución: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    processedAt: row.processed_at,
    total: num(row.total),
    currency: row.currency,
    landingPage: row.landing_page,
    utm: (row.utm ?? {}) as Record<string, string>,
    isFirstOrder: row.is_first_order,
  }));
}

/* ---------------------------- Cuentas y gasto ------------------------------ */

export type AdProvider = "facebook" | "google";

export interface AdAccount {
  id: string;
  provider: AdProvider;
  externalId: string;
  name: string;
  currency: string;
  /** De qué Business Manager es. Vacío en las de antes de guardarlo. */
  businessName: string;
  active: boolean;
  includeFilters: string[];
  excludeFilters: string[];
  lastSyncedAt: string | null;
}

export async function listAdAccounts(storeId: string): Promise<AdAccount[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("ad_accounts")
    .select("*")
    .eq("store_id", storeId)
    .order("provider", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider as AdProvider,
    externalId: row.external_id,
    name: row.name,
    currency: row.currency,
    businessName: row.business_name ?? "",
    active: row.active,
    includeFilters: row.include_filters ?? [],
    excludeFilters: row.exclude_filters ?? [],
    lastSyncedAt: row.last_synced_at,
  }));
}

export async function saveAdAccount(input: {
  storeId: string;
  provider: AdProvider;
  externalId: string;
  name: string;
  currency: string;
  businessId?: string;
  businessName?: string;
  active?: boolean;
  includeFilters?: string[];
  excludeFilters?: string[];
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("ad_accounts")
    .upsert(
      {
        user_id: userId,
        store_id: input.storeId,
        provider: input.provider,
        external_id: input.externalId,
        name: input.name,
        currency: input.currency,
        ...(input.businessId === undefined ? {} : { business_id: input.businessId }),
        ...(input.businessName === undefined ? {} : { business_name: input.businessName }),
        ...(input.active === undefined ? {} : { active: input.active }),
        ...(input.includeFilters === undefined ? {} : { include_filters: input.includeFilters }),
        ...(input.excludeFilters === undefined ? {} : { exclude_filters: input.excludeFilters }),
      },
      { onConflict: "store_id,provider,external_id", defaultToNull: false },
    )
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar la cuenta: ${error.message}`);
  return data.id;
}

export async function setAccountFilters(
  accountId: string,
  includeFilters: string[],
  excludeFilters: string[],
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("ad_accounts")
    .update({ include_filters: includeFilters, exclude_filters: excludeFilters })
    .eq("id", accountId);

  if (error) throw new Error(`No se pudieron guardar los filtros: ${error.message}`);
}

export async function setAccountActive(accountId: string, active: boolean): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("ad_accounts").update({ active }).eq("id", accountId);
  if (error) throw new Error(`No se pudo cambiar la cuenta: ${error.message}`);
}

export interface SpendRow {
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

/**
 * Guarda el gasto de una cuenta.
 *
 * `upsert` sobre `(account_id, day, campaign_ref)` porque el gasto de los últimos
 * días **sigue moviéndose**: Meta ajusta las cifras durante unas 72 horas. Sin
 * esto, sincronizar dos veces la misma semana duplicaría el gasto y el beneficio
 * saldría negativo sin motivo.
 */
export async function saveSpend(accountId: string, rows: SpendRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { supabase } = await requireContext();

  const { error } = await supabase.from("ad_spend").upsert(
    rows.map((row) => ({
      account_id: accountId,
      day: row.day,
      campaign_ref: row.campaignRef,
      campaign_name: row.campaignName,
      spend: row.spend.toFixed(2),
      impressions: row.impressions,
      clicks: row.clicks,
      reported_purchases: row.reportedPurchases,
      reported_value: row.reportedValue.toFixed(2),
      currency: row.currency,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: "account_id,day,campaign_ref" },
  );

  if (error) throw new Error(`No se pudo guardar el gasto: ${error.message}`);

  await supabase
    .from("ad_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", accountId);

  return rows.length;
}

/**
 * El gasto de un rango, ya filtrado y en la forma que espera el motor.
 *
 * **El filtrado por nombre de campaña se aplica al leer, no al guardar.** Es
 * deliberado: si se filtrara al guardar, cambiar un filtro obligaría a volver a
 * descargar meses de historial desde Meta. Filtrando al leer, ajustar un filtro
 * recalcula todo el pasado al instante.
 */
export async function readSpendForRange(
  storeId: string,
  from: string,
  to: string,
): Promise<SpendInput[]> {
  const { supabase } = await requireContext();

  const accounts = await listAdAccounts(storeId);
  const active = accounts.filter((account) => account.active);
  if (active.length === 0) return [];

  const { data, error } = await supabase
    .from("ad_spend")
    .select("*")
    .in(
      "account_id",
      active.map((account) => account.id),
    )
    .gte("day", from)
    .lte("day", to);

  if (error) throw new Error(`No se pudo leer el gasto: ${error.message}`);

  const byId = new Map(active.map((account) => [account.id, account]));
  const rows: SpendInput[] = [];

  for (const row of data ?? []) {
    const account = byId.get(row.account_id);
    if (!account) continue;
    if (!matchesFilters(row.campaign_name, account.includeFilters, account.excludeFilters)) {
      continue;
    }

    rows.push({
      provider: account.provider,
      day: row.day,
      campaignName: row.campaign_name,
      spend: num(row.spend),
      impressions: row.impressions,
      clicks: row.clicks,
      reportedPurchases: row.reported_purchases,
      reportedValue: num(row.reported_value),
    });
  }

  return rows;
}

/**
 * Copia del filtrado de `meta-ads.ts`, para no importar un módulo de red aquí.
 *
 * Se mantiene igual a propósito y las dos están cubiertas por la misma regla:
 * incluir primero, excluir después, subcadena y sin distinguir mayúsculas.
 */
function matchesFilters(name: string, include: string[], exclude: string[]): boolean {
  const lower = name.toLowerCase();
  const clean = (list: string[]) =>
    list.map((item) => item.trim().toLowerCase()).filter(Boolean);

  const includes = clean(include);
  const excludes = clean(exclude);

  if (includes.length > 0 && !includes.some((item) => lower.includes(item))) return false;
  if (excludes.some((item) => lower.includes(item))) return false;
  return true;
}

/** Gasto por campaña de un rango, para la tabla de atribución. */
export interface CampaignSpend {
  provider: AdProvider;
  accountName: string;
  campaignRef: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reportedPurchases: number;
  reportedValue: number;
  currency: string;
}

export async function readCampaignSpend(
  storeId: string,
  from: string,
  to: string,
): Promise<CampaignSpend[]> {
  const { supabase } = await requireContext();

  const accounts = (await listAdAccounts(storeId)).filter((account) => account.active);
  if (accounts.length === 0) return [];

  const { data, error } = await supabase
    .from("ad_spend")
    .select("*")
    .in(
      "account_id",
      accounts.map((account) => account.id),
    )
    .gte("day", from)
    .lte("day", to);

  if (error) throw new Error(`No se pudo leer el gasto: ${error.message}`);

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const grouped = new Map<string, CampaignSpend>();

  for (const row of data ?? []) {
    const account = byId.get(row.account_id);
    if (!account) continue;
    if (!matchesFilters(row.campaign_name, account.includeFilters, account.excludeFilters)) {
      continue;
    }

    const key = `${account.id}:${row.campaign_ref}`;
    const current =
      grouped.get(key) ??
      ({
        provider: account.provider,
        accountName: account.name,
        campaignRef: row.campaign_ref,
        campaignName: row.campaign_name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reportedPurchases: 0,
        reportedValue: 0,
        currency: row.currency || account.currency,
      } satisfies CampaignSpend);

    current.spend += num(row.spend);
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.reportedPurchases += row.reported_purchases;
    current.reportedValue += num(row.reported_value);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.spend - a.spend);
}

/* ------------------------------ Credenciales ------------------------------- */

export interface AdCredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  developerToken?: string;
  loginCustomerId?: string;
  /** Meta: la configuración de Facebook Login for Business, si la app la usa. */
  configId?: string;
  /** Meta: con qué app dada de alta se conecta. Vacío es la de por defecto. */
  metaAppId?: string;
  /**
   * Cuándo caduca el permiso. `null` significa «no caduca».
   *
   * Es lo que evita el fallo silencioso: el token de Meta dura unos sesenta días
   * y sin esta fecha el síntoma sería que un martes cualquiera el gasto aparece a
   * cero y el beneficio se dispara, sin ningún error.
   */
  expiresAt?: Date | null;
  scopes?: string[];
  /** Quién autorizó, para saber a quién pedirle que reconecte. */
  accountName?: string;
}

/**
 * Solo para el servidor.
 *
 * Nada de lo que devuelve puede llegar al navegador. Para la interfaz existe
 * `credentialsStatus`, que dice si están puestas sin decir cuáles son.
 */
export async function readAdCredentials(
  storeId: string,
  provider: AdProvider,
): Promise<AdCredentials | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("ad_credentials")
    .select("*")
    .eq("store_id", storeId)
    .eq("provider", provider)
    .maybeSingle();

  if (!data) return null;

  return {
    accessToken: data.access_token ?? undefined,
    refreshToken: data.refresh_token ?? undefined,
    clientId: data.client_id ?? undefined,
    clientSecret: data.client_secret ?? undefined,
    developerToken: data.developer_token ?? undefined,
    loginCustomerId: data.login_customer_id ?? undefined,
    configId: data.config_id ?? undefined,
    metaAppId: data.meta_app_id ?? undefined,
    expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
    scopes: data.scopes ?? [],
    accountName: data.account_name ?? undefined,
  };
}

/**
 * Guarda las credenciales de una tienda.
 *
 * **Lo que no llega no se toca.** Antes escribía `null` en todo lo que faltara,
 * y eso rompía el caso de la app propia: al volver de Facebook con el token, el
 * callback no manda el identificador ni el secreto de la app —no son suyos— y
 * los borraba. La siguiente reconexión de esa tienda ya no encontraba su app y
 * caía en la del entorno, que es de otro Business Manager.
 */
export async function saveAdCredentials(
  storeId: string,
  provider: AdProvider,
  credentials: AdCredentials,
): Promise<void> {
  const { supabase, userId } = await requireContext();

  const changes: Record<string, unknown> = {
    user_id: userId,
    store_id: storeId,
    provider,
    updated_at: new Date().toISOString(),
  };

  const set = (column: string, value: string | undefined) => {
    if (value !== undefined) changes[column] = value;
  };

  set("access_token", credentials.accessToken);
  set("refresh_token", credentials.refreshToken);
  set("client_id", credentials.clientId);
  set("client_secret", credentials.clientSecret);
  set("developer_token", credentials.developerToken);
  set("login_customer_id", credentials.loginCustomerId);
  set("config_id", credentials.configId);
  set("account_name", credentials.accountName);

  if (credentials.expiresAt !== undefined) {
    changes.token_expires_at = credentials.expiresAt ? credentials.expiresAt.toISOString() : null;
  }
  if (credentials.scopes !== undefined) changes.scopes = credentials.scopes;

  // Solo cuenta como conexión nueva cuando trae un permiso; guardar la app a
  // secas no es haberse conectado a nada.
  if (credentials.accessToken || credentials.refreshToken) {
    changes.connected_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("ad_credentials")
    .upsert(changes as never, { onConflict: "store_id,provider" });

  if (error) throw new Error(`No se pudieron guardar las credenciales: ${error.message}`);
}

/**
 * Solo actualiza el token y su caducidad, sin tocar el resto.
 *
 * Existe para la renovación automática: escribir la fila entera desde ahí
 * borraría el developer token de Google o el nombre de quien autorizó, que no
 * vienen en un re-canje. Es la clase de regresión que solo se nota al
 * sincronizar, días después.
 */
export async function refreshAdToken(
  storeId: string,
  provider: AdProvider,
  token: string,
  expiresAt: Date | null,
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("ad_credentials")
    .update({
      access_token: token,
      token_expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId)
    .eq("provider", provider);

  if (error) throw new Error(`No se pudo renovar el permiso: ${error.message}`);
}

/**
 * Lo único sobre credenciales que la interfaz tiene derecho a saber.
 *
 * Ni el token ni el secreto salen nunca del servidor. Lo que sí sale es cuándo
 * caduca y de quién es: sin eso, «hay que reconectar» no dice ni cuándo ni a
 * quién pedírselo.
 */
export interface ProviderStatus {
  connected: boolean;
  accountName: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  scopes: string[];
  /** Google no funciona sin él y no viene del login. */
  hasDeveloperToken: boolean;
  loginCustomerId: string | null;
}

export interface CredentialsStatus {
  facebook: ProviderStatus;
  google: ProviderStatus;
}

const EMPTY_STATUS: ProviderStatus = {
  connected: false,
  accountName: null,
  expiresAt: null,
  daysLeft: null,
  scopes: [],
  hasDeveloperToken: false,
  loginCustomerId: null,
};

export async function credentialsStatus(storeId: string): Promise<CredentialsStatus> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("ad_credentials")
    .select(
      "provider, access_token, refresh_token, developer_token, login_customer_id, token_expires_at, scopes, account_name",
    )
    .eq("store_id", storeId);

  const status: CredentialsStatus = { facebook: { ...EMPTY_STATUS }, google: { ...EMPTY_STATUS } };

  for (const row of data ?? []) {
    if (row.provider !== "facebook" && row.provider !== "google") continue;

    const expires = row.token_expires_at ? new Date(row.token_expires_at) : null;

    status[row.provider] = {
      // Meta se conecta con un token de usuario; Google con uno de refresco.
      connected:
        row.provider === "facebook" ? Boolean(row.access_token) : Boolean(row.refresh_token),
      accountName: row.account_name,
      expiresAt: row.token_expires_at,
      daysLeft: expires ? Math.floor((expires.getTime() - Date.now()) / 86_400_000) : null,
      scopes: row.scopes ?? [],
      hasDeveloperToken: Boolean(row.developer_token),
      loginCustomerId: row.login_customer_id,
    };
  }

  return status;
}

/** El identificador de la cuenta administradora de Google, que no viene del login. */
export async function setLoginCustomerId(storeId: string, value: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("ad_credentials")
    .update({ login_customer_id: value || null, updated_at: new Date().toISOString() })
    .eq("store_id", storeId)
    .eq("provider", "google");

  if (error) throw new Error(`No se pudo guardar la cuenta administradora: ${error.message}`);
}

/* --------------------------------- Costos --------------------------------- */

/**
 * Toda la configuración de costos de una tienda, de una vez.
 *
 * Se lee junta porque el motor la necesita junta y son cuatro tablas pequeñas:
 * cuatro consultas en paralelo cuestan menos que una sola consulta con tres
 * uniones, y el resultado es mucho más fácil de leer.
 *
 * La zona horaria y la moneda no están aquí: vienen de Shopify y las pone quien
 * llama, porque son de la tienda y no configurables.
 */
export async function readCostSettings(
  storeId: string,
  shop: { timeZone: string; currency: string },
): Promise<CostSettings> {
  const { supabase } = await requireContext();

  const [cogs, zones, gateways, custom] = await Promise.all([
    supabase.from("cost_cogs").select("*").eq("store_id", storeId),
    supabase.from("cost_shipping_zones").select("*").eq("store_id", storeId),
    supabase.from("cost_gateway_fees").select("*").eq("store_id", storeId),
    supabase.from("cost_custom").select("*").eq("store_id", storeId),
  ]);

  return {
    cogs: (cogs.data ?? []).map((row) => ({
      productRef: row.product_ref,
      variantRef: row.variant_ref,
      amount: num(row.amount),
    })),
    shippingZones: (zones.data ?? []).map((row) => ({
      name: row.name,
      countries: row.countries ?? [],
      isDefault: row.is_default,
      tiers: parseTiers(row.tiers),
    })),
    gatewayFees: (gateways.data ?? []).map((row) => ({
      gateway: row.gateway,
      percent: num(row.percent),
      fixed: num(row.fixed),
    })),
    customCosts: (custom.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as CustomCostKind,
      amount: num(row.amount),
      basis: row.basis as CustomCostBasis,
      category: row.category,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      repeat: row.repeat as CustomCostRepeat,
      inLtvCac: row.in_ltv_cac,
    })),
    timeZone: shop.timeZone,
    currency: shop.currency,
  };
}

/**
 * Los tramos vienen de una columna `jsonb`, así que pueden ser cualquier cosa.
 *
 * Se valida en vez de confiar: un tramo con `qty` no numérico haría que el coste
 * de envío saliera `NaN`, y un `NaN` se propaga hasta el beneficio neto y deja
 * toda la pantalla en «NaN» sin decir de dónde vino.
 */
function parseTiers(value: unknown): ShippingTier[] {
  if (!Array.isArray(value)) return [];

  const tiers: ShippingTier[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const qty = Number(record.qty);
    const cost = Number(record.cost);
    if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty <= 0) continue;
    tiers.push({ qty, cost });
  }

  return tiers.sort((a, b) => a.qty - b.qty);
}

/* Escrituras de cada tipo de costo. */

export async function saveCogs(
  storeId: string,
  rows: { productRef: string; variantRef: string; label: string; amount: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("cost_cogs").upsert(
    rows.map((row) => ({
      user_id: userId,
      store_id: storeId,
      product_ref: row.productRef,
      variant_ref: row.variantRef,
      label: row.label,
      amount: row.amount.toFixed(2),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "store_id,product_ref,variant_ref", defaultToNull: false },
  );

  if (error) throw new Error(`No se pudo guardar el coste de mercancía: ${error.message}`);
}

export async function saveShippingZone(
  storeId: string,
  zone: ShippingZone,
): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("cost_shipping_zones").upsert(
    {
      user_id: userId,
      store_id: storeId,
      name: zone.name,
      countries: zone.countries,
      is_default: zone.isDefault,
      tiers: zone.tiers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,name", defaultToNull: false },
  );

  if (error) throw new Error(`No se pudo guardar la zona: ${error.message}`);
}

export async function deleteShippingZone(storeId: string, name: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("cost_shipping_zones")
    .delete()
    .eq("store_id", storeId)
    .eq("name", name);

  if (error) throw new Error(`No se pudo borrar la zona: ${error.message}`);
}

export async function saveGatewayFees(storeId: string, fees: GatewayFee[]): Promise<void> {
  if (fees.length === 0) return;
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("cost_gateway_fees").upsert(
    fees.map((fee) => ({
      user_id: userId,
      store_id: storeId,
      gateway: fee.gateway,
      percent: fee.percent.toFixed(4),
      fixed: fee.fixed.toFixed(2),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "store_id,gateway", defaultToNull: false },
  );

  if (error) throw new Error(`No se pudieron guardar las comisiones: ${error.message}`);
}

export async function saveCustomCost(
  storeId: string,
  cost: Omit<CustomCost, "id"> & { id?: string },
): Promise<string> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    store_id: storeId,
    name: cost.name,
    kind: cost.kind,
    amount: cost.amount.toFixed(4),
    basis: cost.basis,
    category: cost.category,
    starts_on: cost.startsOn,
    ends_on: cost.endsOn,
    repeat: cost.repeat,
    in_ltv_cac: cost.inLtvCac,
  };

  if (cost.id) {
    const { error } = await supabase.from("cost_custom").update(row).eq("id", cost.id);
    if (error) throw new Error(`No se pudo guardar el costo: ${error.message}`);
    return cost.id;
  }

  const { data, error } = await supabase.from("cost_custom").insert(row).select("id").single();
  if (error) throw new Error(`No se pudo crear el costo: ${error.message}`);
  return data.id;
}

export async function deleteCustomCost(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("cost_custom").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar el costo: ${error.message}`);
}

/**
 * Las pasarelas que aparecen en los pedidos, con si ya tienen comisión puesta.
 *
 * Es lo que hace que la lista no se escriba a mano: en cuanto se cobra por una
 * pasarela nueva aparece sola pidiendo su porcentaje, en vez de restar cero en
 * silencio y regalar margen en el informe.
 */
export async function gatewaysInUse(
  storeId: string,
): Promise<{ gateway: string; orders: number; configured: boolean }[]> {
  const { supabase } = await requireContext();

  const [orders, fees] = await Promise.all([
    supabase.from("shop_orders").select("gateway").eq("store_id", storeId).eq("test", false),
    supabase.from("cost_gateway_fees").select("gateway").eq("store_id", storeId),
  ]);

  const configured = new Set((fees.data ?? []).map((row) => row.gateway));
  const counts = new Map<string, number>();

  for (const row of orders.data ?? []) {
    if (!row.gateway) continue;
    counts.set(row.gateway, (counts.get(row.gateway) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([gateway, count]) => ({
      gateway,
      orders: count,
      configured: configured.has(gateway),
    }))
    .sort((a, b) => b.orders - a.orders);
}

/**
 * Las variantes que se han vendido, con si tienen coste de mercancía puesto.
 *
 * Mismo principio que las pasarelas: se descubre de lo vendido. Una variante sin
 * coste no da error, da un beneficio inflado, que es peor — así que la interfaz
 * necesita poder enseñar exactamente cuáles faltan.
 */
export async function variantsSold(
  storeId: string,
): Promise<
  { productRef: string; variantRef: string; sku: string; title: string; units: number; cogs: number | null }[]
> {
  const { supabase } = await requireContext();

  const { data: orders } = await supabase
    .from("shop_orders")
    .select("id")
    .eq("store_id", storeId)
    .eq("test", false);

  const orderIds = (orders ?? []).map((row) => row.id);
  if (orderIds.length === 0) return [];

  const [items, cogs] = await Promise.all([
    supabase.from("shop_order_items").select("*").in("order_id", orderIds),
    supabase.from("cost_cogs").select("*").eq("store_id", storeId),
  ]);

  const rules = cogs.data ?? [];
  const grouped = new Map<
    string,
    { productRef: string; variantRef: string; sku: string; title: string; units: number }
  >();

  for (const item of items.data ?? []) {
    const key = item.variant_ref || item.product_ref || item.title;
    const current =
      grouped.get(key) ??
      {
        productRef: item.product_ref,
        variantRef: item.variant_ref,
        sku: item.sku,
        title: item.title,
        units: 0,
      };
    current.units += Math.max(0, item.quantity - item.refunded_quantity);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((entry) => {
      const exact = rules.find(
        (rule) => rule.variant_ref && rule.variant_ref === entry.variantRef,
      );
      const byProduct = rules.find(
        (rule) => !rule.variant_ref && rule.product_ref === entry.productRef,
      );
      const rule = exact ?? byProduct;

      return { ...entry, cogs: rule ? num(rule.amount) : null };
    })
    .sort((a, b) => b.units - a.units);
}
