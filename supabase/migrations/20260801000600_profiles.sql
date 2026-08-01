-- ---------------------------------------------------------------------------
-- Personas, papeles y límite de gasto.
--
-- Hasta ahora cada cuenta veía solo lo suyo y podía hacerlo todo. Eso vale para
-- una persona; en cuanto entra alguien más hay que decidir quién puede gastar,
-- quién puede publicar en la tienda y quién ve los márgenes.
--
-- El reparto de permisos vive en `src/lib/roles.ts`, no aquí: aquí solo se
-- guarda qué papel tiene cada uno. Duplicar la tabla de permisos en SQL sería
-- tener dos fuentes de la verdad que se separan a la primera semana.
--
-- ## El primero que entra es el dueño
--
-- Sin eso, la primera cuenta se queda sin permisos y no hay nadie que pueda
-- dárselos: la plataforma nace bloqueada. Se resuelve en el disparador, contando
-- si ya hay alguien.
--
-- ## La recursión, que es lo que rompe estos sistemas
--
-- La política natural sería «un admin ve todos los perfiles», y para saber si
-- eres admin hay que leer `profiles` — que dispara la misma política, que vuelve
-- a leer `profiles`. Postgres corta con un error y **nadie puede leer nada**,
-- incluido su propio perfil.
--
-- Se rompe con una función `security definer`: corre con los permisos de quien
-- la creó, así que lee la tabla sin pasar por RLS y devuelve solo el papel.
-- ---------------------------------------------------------------------------

-- La tabla ya existía con el nombre para mostrar: se amplía, no se rehace.
alter table public.profiles
  add column if not exists email text not null default '',
  -- dueño, admin, editor, redactor, analista, invitado. Ver `src/lib/roles.ts`.
  add column if not exists role text not null default 'invitado',
  -- Tope de gasto al mes, en dólares. `null` es sin tope.
  add column if not exists monthly_limit_usd numeric,
  -- Desactivado: mantiene el histórico pero no deja entrar.
  add column if not exists disabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- El primero que entra manda
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, role, monthly_limit_usd)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.email, ''),
    -- El primero es el dueño; los demás entran sin permisos y alguien se los da.
    -- Entrar con permisos por defecto sería que cualquiera que se registre pueda
    -- gastar, y el registro puede estar abierto.
    case when (select count(*) from public.profiles) = 0 then 'dueño' else 'invitado' end,
    -- Y sin tope solo el dueño: al resto se le pone a mano cuando se le da papel.
    case when (select count(*) from public.profiles) = 0 then null else 0 end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Las cuentas que ya existían se quedarían sin perfil: la primera pasa a dueño.
-- Las cuentas que ya tenían perfil se quedan con papel de invitado por el valor
-- por defecto de la columna, así que hay que ascender a la primera aparte.
insert into public.profiles (id, display_name, email, role, monthly_limit_usd)
select
  u.id,
  '',
  coalesce(u.email, ''),
  case when u.created_at = (select min(created_at) from auth.users) then 'dueño' else 'invitado' end,
  case when u.created_at = (select min(created_at) from auth.users) then null else 0 end
from auth.users u
on conflict (id) do nothing;

-- Y la primera cuenta pasa a dueño aunque su perfil ya existiera: sin esto la
-- plataforma queda sin nadie que pueda repartir permisos.
update public.profiles
set role = 'dueño', monthly_limit_usd = null
where id = (select id from auth.users order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'dueño');

-- El correo se rellena para los que ya estaban: es lo que se lee en la lista.
update public.profiles p
set email = coalesce(u.email, '')
from auth.users u
where u.id = p.id and p.email = '';

-- ---------------------------------------------------------------------------
-- Leer el papel sin disparar la política que lo lee
-- ---------------------------------------------------------------------------

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

grant execute on function public.current_role_name() to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- El suyo lo ve siempre: sin esto nadie sabría ni qué papel tiene.
create policy "profiles_read_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_read_all_for_managers" on public.profiles
  for select to authenticated
  using (public.current_role_name() in ('dueño', 'admin'));

-- Cambiar papeles y límites solo desde aquí, y con las reglas de `roles.ts`
-- comprobadas antes en el servidor. La base de datos pone el suelo: quien no
-- gestione personas no escribe una fila ajena, pase lo que pase arriba.
create policy "profiles_write_for_managers" on public.profiles
  for update to authenticated
  using (public.current_role_name() in ('dueño', 'admin'))
  with check (public.current_role_name() in ('dueño', 'admin'));

-- Su nombre sí puede cambiarlo cualquiera. El papel y el límite no: los protege
-- un disparador, porque una política no distingue qué columna se tocó.
create policy "profiles_update_own_name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() in ('dueño', 'admin') then
    return new;
  end if;

  -- Nadie se sube el papel ni el límite a sí mismo. Es la puerta de atrás obvia
  -- si se deja abierta: cambiarse `role` a 'dueño' y ya está.
  if new.role is distinct from old.role
     or new.monthly_limit_usd is distinct from old.monthly_limit_usd
     or new.disabled is distinct from old.disabled then
    raise exception 'Solo un administrador puede cambiar el papel, el límite o el estado.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------------
-- Registro de lo que no se deshace
--
-- Publicar en la tienda es lo único que ven los clientes en cuanto se guarda.
-- Cuando algo sale mal, la pregunta es siempre la misma —quién y cuándo— y sin
-- registro no hay forma de responderla.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- `tema.escribir`, `pagina.publicar`, `persona.papel`…
  action text not null,
  -- Sobre qué: el tema, la tienda, la persona.
  target text not null default '',
  detail jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists audit_log_recent_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Cada uno ve lo suyo; quien gestiona personas lo ve todo. Nadie borra: un
-- registro que se puede borrar no sirve para lo que sirve un registro.
create policy "audit_read_own" on public.audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "audit_read_all_for_managers" on public.audit_log
  for select to authenticated
  using (public.current_role_name() in ('dueño', 'admin'));

create policy "audit_write_own" on public.audit_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));
