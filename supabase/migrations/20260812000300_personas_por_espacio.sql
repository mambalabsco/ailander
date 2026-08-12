-- Administrar personas deja de ser global y pasa a ser por espacio.
--
-- Las políticas de `profiles` se escribieron antes de que existieran los
-- espacios de trabajo y se quedaron preguntando por el papel a secas
-- (`current_role_name() in ('dueño','admin')`). La consecuencia es que un
-- administrador del espacio A puede leer y editar el perfil de alguien del
-- espacio B, que no es lo que promete `equipo-compartido.md` ni lo que espera
-- nadie que invita a un cliente a su equipo.
--
-- ## Por qué `security definer`
--
-- Igual que `mis_espacios()` y `manda_en()`: una política de `profiles` que
-- consultara `workspace_members` con RLS puesta entraría por la puerta que está
-- definiendo. Lo que costó descubrirlo está escrito en
-- `20260811000700_workspace_sin_recursion.sql`.

create or replace function public.mando_sobre(persona uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mio
    join public.workspace_members suyo on suyo.workspace_id = mio.workspace_id
    where mio.user_id = (select auth.uid())
      and mio.role in ('dueño', 'admin')
      and suyo.user_id = persona
  );
$$;

grant execute on function public.mando_sobre(uuid) to authenticated;

create or replace function public.comparte_espacio(persona uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mio
    join public.workspace_members suyo on suyo.workspace_id = mio.workspace_id
    where mio.user_id = (select auth.uid())
      and suyo.user_id = persona
  );
$$;

grant execute on function public.comparte_espacio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Las políticas de `profiles`
-- ---------------------------------------------------------------------------

-- Ver a los del equipo, no a todo el mundo. La de «lee el suyo» se queda como
-- está: sin ella, quien todavía no está en ningún espacio no vería ni su papel.
drop policy if exists "profiles_read_all_for_managers" on public.profiles;
drop policy if exists "profiles: los del espacio se ven" on public.profiles;
create policy "profiles: los del espacio se ven" on public.profiles
  for select to authenticated
  using (public.comparte_espacio(id));

drop policy if exists "profiles_write_for_managers" on public.profiles;
drop policy if exists "profiles: quien manda escribe" on public.profiles;
create policy "profiles: quien manda escribe" on public.profiles
  for update to authenticated
  using (public.mando_sobre(id))
  with check (public.mando_sobre(id));

-- El disparador que impide que uno se suba el papel a sí mismo preguntaba por
-- lo mismo, así que dejarlo como estaba haría inútil la política nueva: un
-- administrador de otro espacio seguiría pasando por aquí.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mando_sobre(new.id) then
    return new;
  end if;

  -- Nadie se sube el papel, el límite ni se reactiva a sí mismo.
  if new.role is distinct from old.role
     or new.monthly_limit_usd is distinct from old.monthly_limit_usd
     or new.disabled is distinct from old.disabled then
    raise exception 'Solo un administrador de tu espacio puede cambiar el papel, el límite o el estado.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Y el registro, que tenía el mismo agujero
-- ---------------------------------------------------------------------------

-- Quien manda lee el registro **de su espacio**. Las filas antiguas sin espacio
-- las ve solo quien las escribió: es preferible a enseñárselas a todos los
-- administradores de todos los equipos.
drop policy if exists "audit_read_all_for_managers" on public.audit_log;
drop policy if exists "audit_log: quien manda lee el de su espacio" on public.audit_log;
create policy "audit_log: quien manda lee el de su espacio" on public.audit_log
  for select to authenticated
  using (workspace_id is not null and public.manda_en(workspace_id));

-- ---------------------------------------------------------------------------
-- Que no quede ninguna política preguntando por el papel global
--
-- Sin esta comprobación, una política vieja que sobreviva deja el agujero
-- abierto y la aplicación funcionando igual de bien — que es exactamente cómo
-- no se descubre.
-- ---------------------------------------------------------------------------

do $$
declare
  restantes integer;
begin
  select count(*) into restantes
  from pg_policies
  where schemaname = 'public'
    and tablename in ('profiles', 'audit_log')
    and coalesce(qual, '') || coalesce(with_check, '') like '%current_role_name%';

  if restantes > 0 then
    raise exception 'Quedan % políticas preguntando por el papel global', restantes;
  end if;
end;
$$;
