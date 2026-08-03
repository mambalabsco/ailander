-- ---------------------------------------------------------------------------
-- Cada cuenta publicitaria recuerda con qué perfil de Facebook se lee.
--
-- La migración anterior ató la **tienda** a un perfil, y eso se queda corto: una
-- tienda puede tener campañas en cuentas que solo se ven desde perfiles
-- distintos —dos Business Manager de dos socios, o uno propio y otro de una
-- agencia—. Con un solo perfil por tienda, las cuentas del otro no se pueden
-- leer y su gasto cuenta cero.
--
-- Lo que de verdad decide qué token hace falta no es la tienda: es **la cuenta**.
-- Cada una la ve un perfil concreto, y ahí es donde tiene que estar el dato.
--
-- Con esto salen las dos direcciones que hacían falta:
--
-- - Un perfil sirve a muchas tiendas: se inicia sesión una vez y sus cuentas se
--   reparten entre las tiendas que las paguen.
-- - Una tienda usa muchos perfiles: sus cuentas activas pueden venir de dos
--   sesiones distintas y cada una se lee con la suya.
--
-- `null` significa «el de la tienda, o el de por defecto». Es lo que tienen las
-- cuentas dadas de alta antes de esto, y sigue funcionando.
-- ---------------------------------------------------------------------------

alter table public.ad_accounts
  add column if not exists meta_login_id uuid references public.meta_logins (id) on delete set null;

create index if not exists ad_accounts_login_idx
  on public.ad_accounts (meta_login_id) where meta_login_id is not null;

comment on column public.ad_accounts.meta_login_id is
  'Con qué sesión de Facebook se lee esta cuenta. Null: la de la tienda o la de por defecto.';
