-- ---------------------------------------------------------------------------
-- Beneficio real por tienda: pedidos, costos y gasto publicitario.
--
-- El problema que resuelve: Shopify sabe lo que entró y Meta sabe lo que se
-- gastó, pero **nadie sabe lo que quedó**. Para saberlo hay que juntar cuatro
-- fuentes que viven en sitios distintos, y por eso hay tantas tablas aquí.
--
--   pedidos + líneas   lo que entró            (Shopify)
--   gasto              lo que costó traerlo    (Meta, Google)
--   costos             lo que costó servirlo   (a mano: COGS, envío, comisión)
--
-- Dos decisiones que atraviesan todo el esquema:
--
-- **Todo se guarda en la moneda de la tienda, nunca en la del mercado.** Una
-- tienda de Shopify con mercados en México, España y Estados Unidos liquida en
-- una sola moneda —la de la tienda— y es en esa en la que llegan los pedidos por
-- la API. Convertir a la del mercado exigiría un tipo de cambio histórico por
-- pedido; mezclarlas sin convertir daría sumas sin sentido. Se guarda la moneda
-- en cada fila para que nunca haya que adivinarla.
--
-- **El gasto se guarda por día y campaña, no por mes.** Es el grano más fino que
-- devuelven las dos APIs sin costar una fortuna en llamadas, y permite recortar
-- cualquier rango después sin volver a pedir nada.
-- ---------------------------------------------------------------------------

/* ------------------------- Datos que declara la tienda -------------------- */

/*
 * Moneda y zona horaria **de la tienda**, tal y como las declara Shopify.
 *
 * Se guardan y no se preguntan en cada carga por dos motivos. El primero es que
 * son la base de todos los informes —deciden en qué moneda están los importes y
 * a qué día pertenece cada pedido— y un informe no debería caerse porque la API
 * de Shopify tarde. El segundo es que no son configurables: la tienda mexicana
 * liquida en dólares aunque venda en pesos, y dejar que alguien escriba «MXN» en
 * un formulario haría que todos los números mintieran de forma consistente.
 *
 * Se refrescan en cada sincronización.
 */
alter table public.stores
  add column if not exists shop_currency text,
  add column if not exists shop_time_zone text;

/* ------------------------------- Pedidos --------------------------------- */

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  -- El identificador global de Shopify, tal cual. Es la clave para no duplicar
  -- al volver a sincronizar el mismo rango.
  shopify_ref text not null,
  -- El número que se ve en el panel: «#NT2742».
  name text not null,

  processed_at timestamptz not null,
  -- Moneda de la **tienda**, la de los importes de esta fila.
  currency text not null,

  /*
   * Los cinco importes de los que sale todo lo demás.
   *
   * Se guardan por separado y no ya sumados porque el informe de pérdidas y
   * ganancias los enseña línea a línea, y porque la definición de «ingresos»
   * cambia según a quién le preguntes. Guardando las piezas, la fórmula se
   * puede corregir sin volver a sincronizar tres meses de pedidos.
   */
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  returns numeric(14, 2) not null default 0,
  taxes numeric(14, 2) not null default 0,
  shipping_charged numeric(14, 2) not null default 0,
  tips numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,

  -- Pasarela de pago: de ella depende la comisión que se resta.
  gateway text not null default '',
  financial_status text not null default '',
  -- Los pedidos de prueba no se cuentan en ningún informe, pero se guardan:
  -- borrarlos haría que la siguiente sincronización los trajera otra vez.
  test boolean not null default false,

  /*
   * Cliente, de forma indirecta.
   *
   * Se guarda la referencia de Shopify, no el nombre ni el correo: para el
   * cálculo del coste de adquisición solo hace falta saber si es la primera
   * compra de alguien, y para eso basta un identificador opaco.
   */
  customer_ref text not null default '',
  is_first_order boolean not null default false,

  -- Atribución: de qué anuncio vino. Es lo que conecta este pedido con el gasto.
  landing_page text not null default '',
  utm jsonb not null default '{}'::jsonb,

  synced_at timestamptz not null default now(),
  unique (store_id, shopify_ref)
);

-- Los informes siempre recortan por tienda y fecha; sin este índice cada carga
-- del panel leería la tabla entera.
create index if not exists shop_orders_store_date_idx
  on public.shop_orders (store_id, processed_at desc);

create table if not exists public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders (id) on delete cascade,

  -- Referencias de Shopify: son las que enlazan con el coste de mercancía.
  product_ref text not null default '',
  variant_ref text not null default '',
  sku text not null default '',
  title text not null,

  quantity integer not null default 0,
  -- Precio unitario **antes** de descuento, para poder repartir el descuento
  -- del pedido entre las líneas sin perder el precio de tarifa.
  unit_price numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  refunded_quantity integer not null default 0
);

create index if not exists shop_order_items_order_idx
  on public.shop_order_items (order_id);

-- El coste de mercancía se busca por variante en rangos grandes de pedidos.
create index if not exists shop_order_items_variant_idx
  on public.shop_order_items (variant_ref);

/* --------------------------- Cuentas de anuncios -------------------------- */

create table if not exists public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  provider text not null check (provider in ('facebook', 'google')),
  -- El identificador de la cuenta en el proveedor, sin el prefijo `act_`.
  external_id text not null,
  name text not null default '',
  currency text not null default 'USD',
  -- Una cuenta desactivada deja de sincronizarse pero conserva su historial.
  active boolean not null default true,

  /*
   * Filtros por nombre de campaña.
   *
   * Hacen falta porque una cuenta publicitaria casi nunca es de una sola
   * tienda: la misma cuenta lleva campañas de México, de Chile y de un producto
   * que ya no existe. Sin filtrar, el gasto de todas ellas se restaría del
   * beneficio de una tienda que no las pagó.
   *
   * Si `include` tiene algo, solo entra lo que coincide con alguno. Después se
   * quita lo que coincida con `exclude`. Ese orden importa: permite «todo lo de
   * México menos la campaña vieja» con dos reglas en vez de veinte.
   */
  include_filters text[] not null default '{}',
  exclude_filters text[] not null default '{}',

  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, provider, external_id)
);

create table if not exists public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ad_accounts (id) on delete cascade,

  day date not null,
  campaign_ref text not null default '',
  campaign_name text not null default '',

  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,

  /*
   * Lo que el proveedor **dice** que vendió.
   *
   * No se usa para calcular el beneficio —para eso están los pedidos de
   * Shopify, que son dinero cobrado y no atribución— pero se guarda porque la
   * diferencia entre ambos es en sí un dato: cuando Meta declara el doble de
   * ventas que las que aparecen en la tienda, el problema es la ventana de
   * atribución, no el producto.
   */
  reported_purchases integer not null default 0,
  reported_value numeric(14, 2) not null default 0,

  -- Moneda de la cuenta publicitaria, que puede no ser la de la tienda.
  currency text not null default 'USD',
  synced_at timestamptz not null default now(),

  -- Volver a sincronizar un día ya sincronizado lo actualiza. Hace falta porque
  -- el gasto de los últimos días sigue moviéndose durante 72 horas.
  unique (account_id, day, campaign_ref)
);

create index if not exists ad_spend_account_day_idx
  on public.ad_spend (account_id, day desc);

/*
 * Credenciales de los proveedores de anuncios.
 *
 * Por tienda y proveedor, igual que las de Shopify y por el mismo motivo: quien
 * lleva dos tiendas tiene dos cuentas publicitarias, y un único token global
 * mezclaría el gasto de las dos.
 *
 * Ningún campo de aquí viaja nunca al navegador. La interfaz solo sabe si están
 * puestos o no.
 */
create table if not exists public.ad_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  provider text not null check (provider in ('facebook', 'google')),

  -- Meta: token de usuario de sistema, que no caduca.
  access_token text,
  -- Google: el flujo es de refresco, y además exige tres datos más.
  refresh_token text,
  client_id text,
  client_secret text,
  -- Google Ads no responde sin él, y hay que pedirlo y esperar aprobación.
  developer_token text,
  -- La cuenta administradora desde la que se consulta.
  login_customer_id text,

  updated_at timestamptz not null default now(),
  unique (store_id, provider)
);

/* ---------------------------------- Costos -------------------------------- */

/*
 * Coste de mercancía, por variante.
 *
 * Por variante y no por producto porque el bote de 60 cápsulas y el pack de tres
 * cuestan distinto, y es justo la diferencia entre ellos la que decide si el
 * pack de tres compensa. `variant_ref` vacío significa «cualquier variante de
 * este producto», que es el atajo para los productos de una sola variante.
 */
create table if not exists public.cost_cogs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  product_ref text not null default '',
  variant_ref text not null default '',
  label text not null default '',
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',

  updated_at timestamptz not null default now(),
  unique (store_id, product_ref, variant_ref)
);

/*
 * Coste de envío por zona, con tramos por cantidad.
 *
 * Los tramos son necesarios porque el envío no es lineal: mandar dos botes no
 * cuesta el doble que uno. Se guardan como lista ordenada
 * `[{"qty": 1, "cost": 5.75}, ...]` y se aplica el tramo mayor que no pase de la
 * cantidad del pedido, así que basta declarar los que cambian.
 *
 * `countries` vacío en la zona marcada por defecto: es la que recoge todo lo que
 * no encaja en ninguna otra, para que ningún pedido quede sin coste de envío.
 */
create table if not exists public.cost_shipping_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  name text not null,
  countries text[] not null default '{}',
  is_default boolean not null default false,
  tiers jsonb not null default '[]'::jsonb,

  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

/*
 * Comisión por pasarela.
 *
 * Porcentaje más importe fijo, que es la forma que tienen todas. La lista de
 * pasarelas no se escribe a mano: sale de los pedidos ya sincronizados, así que
 * aparece sola en cuanto se cobra por una nueva.
 */
create table if not exists public.cost_gateway_fees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  gateway text not null,
  percent numeric(7, 4) not null default 0,
  fixed numeric(14, 2) not null default 0,

  updated_at timestamptz not null default now(),
  unique (store_id, gateway)
);

/*
 * Costos propios: sueldos, herramientas, la cuota de Shopify.
 *
 * Los fijos son un importe en un rango de fechas. Los variables son un
 * porcentaje sobre una base, para lo que escala con las ventas —la comisión de
 * un socio, el coste de un centro logístico—.
 *
 * `repeat` evita tener que crear doce filas para un gasto mensual: se declara
 * una vez y el motor lo reparte por los días del rango que se esté mirando.
 */
create table if not exists public.cost_custom (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  name text not null,
  kind text not null default 'fijo' check (kind in ('fijo', 'variable')),
  -- Fijo: importe. Variable: porcentaje.
  amount numeric(14, 4) not null default 0,
  -- Solo para los variables: sobre qué se aplica el porcentaje.
  basis text not null default 'ingresos'
    check (basis in ('ingresos', 'ventas-brutas', 'beneficio-bruto', 'gasto-publicitario')),
  category text not null default '',

  starts_on date not null,
  ends_on date not null,
  repeat text not null default 'ninguno'
    check (repeat in ('ninguno', 'diario', 'semanal', 'mensual', 'anual')),
  -- Si cuenta como coste de adquisición para la relación LTV:CAC.
  in_ltv_cac boolean not null default false,

  created_at timestamptz not null default now()
);

/* ----------------------------------- RLS ---------------------------------- */

alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.ad_spend enable row level security;
alter table public.ad_credentials enable row level security;
alter table public.cost_cogs enable row level security;
alter table public.cost_shipping_zones enable row level security;
alter table public.cost_gateway_fees enable row level security;
alter table public.cost_custom enable row level security;

create policy "shop_orders_own" on public.shop_orders
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Las líneas cuelgan del pedido: se comprueba su dueño, igual que las variantes
-- de un experimento.
create policy "shop_order_items_own" on public.shop_order_items
  for all to authenticated
  using (
    exists (select 1 from public.shop_orders o
             where o.id = order_id and o.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.shop_orders o
             where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy "ad_accounts_own" on public.ad_accounts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "ad_spend_own" on public.ad_spend
  for all to authenticated
  using (
    exists (select 1 from public.ad_accounts a
             where a.id = account_id and a.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.ad_accounts a
             where a.id = account_id and a.user_id = (select auth.uid()))
  );

create policy "ad_credentials_own" on public.ad_credentials
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "cost_cogs_own" on public.cost_cogs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "cost_shipping_zones_own" on public.cost_shipping_zones
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "cost_gateway_fees_own" on public.cost_gateway_fees
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "cost_custom_own" on public.cost_custom
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
