-- El correo que un administrador propone y confirma la persona.
--
-- ## Por qué una propuesta y no un cambio
--
-- Comprobado contra la API el 12 de agosto de 2026: `updateUserById({ email })`
-- cambia el correo **al instante** y conserva `email_confirmed_at`, o sea que la
-- vía de administración se salta el `double_confirm_changes` que está puesto en
-- `config.toml`. Un correo mal tecleado dejaría la cuenta apuntando a un buzón
-- ajeno, y quien lo tuviera podría pedir recuperación y quedársela.
--
-- Así que el administrador propone, y quien llama a `updateUser` es la propia
-- persona desde su sesión: eso dispara el flujo nativo, con su correo al buzón
-- viejo y al nuevo.
--
-- ## Por qué no lleva `workspace_id`
--
-- Porque quién puede verla no se decide por el espacio de la fila sino por la
-- persona a la que afecta, y eso ya lo contesta `mando_sobre`. Una columna que
-- rellena un disparador y que nadie consulta es una que algún día se lee por
-- error creyendo que significa algo.
create table if not exists public.pending_email_changes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nuevo_email text not null,
  pedido_por uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pending_email_changes enable row level security;

drop policy if exists "correo propuesto: la persona y quien manda" on public.pending_email_changes;
create policy "correo propuesto: la persona y quien manda" on public.pending_email_changes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.mando_sobre(user_id));

-- `pedido_por` lo comprueba la base y no solo el código: una fila con el nombre
-- de otro sería indistinguible de una legítima justo en el registro que sirve
-- para saber quién pidió qué.
drop policy if exists "correo propuesto: lo pide quien manda" on public.pending_email_changes;
create policy "correo propuesto: lo pide quien manda" on public.pending_email_changes
  for insert to authenticated
  with check (public.mando_sobre(user_id) and pedido_por = (select auth.uid()));

-- Rehacer una propuesta sin contestar es lo normal —se tecleó mal la primera
-- vez—, así que el `upsert` necesita poder actualizar.
drop policy if exists "correo propuesto: se puede rehacer" on public.pending_email_changes;
create policy "correo propuesto: se puede rehacer" on public.pending_email_changes
  for update to authenticated
  using (public.mando_sobre(user_id))
  with check (public.mando_sobre(user_id) and pedido_por = (select auth.uid()));

-- La quita la persona al confirmar o rechazar, y quien manda al arrepentirse.
drop policy if exists "correo propuesto: la quita la persona o quien manda" on public.pending_email_changes;
create policy "correo propuesto: la quita la persona o quien manda" on public.pending_email_changes
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.mando_sobre(user_id));

-- ---------------------------------------------------------------------------
-- El correo de `profiles`, que se quedaba con el viejo para siempre
-- ---------------------------------------------------------------------------
--
-- `profiles.email` lo rellena un disparador **al registrarse** y no había
-- ninguno para cuando cambia. Con el cambio confirmándose desde el buzón de la
-- persona —minutos u horas después, sin código nuestro delante— la columna se
-- quedaría con el correo antiguo. No es cosmético: `addMemberByEmail` busca por
-- ella, y es lo que enseña el registro donde si no habría un identificador.

create or replace function public.sincronizar_correo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sincronizar_correo();
