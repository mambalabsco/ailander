-- Quien manda en un espacio puede repartirlo.
--
-- La fase 1 dejó `workspace_members` con política de **lectura y nada más**, así
-- que añadir a alguien fallaba con «new row violates row-level security policy».
-- El modelo estaba bien; faltaba poder escribir en él.
--
-- ## Por qué una función y no la condición escrita en la política
--
-- Porque la política vive **en** `workspace_members` y la condición necesita
-- consultar `workspace_members` para saber si mandas. Eso es una recursión:
-- Postgres corta con «infinite recursion detected in policy».
--
-- Una función `security definer` se salta RLS al mirar, así que la política
-- pregunta sin volver a entrar por la puerta que está definiendo. Es el patrón
-- que recomienda Supabase para exactamente este caso.
create or replace function public.manda_en(espacio uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = espacio
      and m.user_id = (select auth.uid())
      and m.role in ('dueño', 'admin')
  );
$$;

-- Ver a los demás miembros, no solo la propia pertenencia. Sin esto la pantalla
-- de equipo enseña una lista de una persona: tú.
drop policy if exists "cada uno ve su pertenencia" on public.workspace_members;
drop policy if exists "los del espacio se ven entre ellos" on public.workspace_members;
create policy "los del espacio se ven entre ellos" on public.workspace_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or workspace_id in (
      select m.workspace_id from public.workspace_members m where m.user_id = (select auth.uid())
    )
  );

drop policy if exists "quien manda añade" on public.workspace_members;
create policy "quien manda añade" on public.workspace_members
  for insert to authenticated
  with check (public.manda_en(workspace_id));

drop policy if exists "quien manda cambia papeles" on public.workspace_members;
create policy "quien manda cambia papeles" on public.workspace_members
  for update to authenticated
  using (public.manda_en(workspace_id))
  with check (public.manda_en(workspace_id));

/*
 * Sacar: quien manda, o uno mismo.
 *
 * Dejar salir por su propio pie evita tener que pedirle a alguien que te saque
 * de un equipo en el que ya no quieres estar.
 */
drop policy if exists "quien manda saca" on public.workspace_members;
create policy "quien manda saca" on public.workspace_members
  for delete to authenticated
  using (public.manda_en(workspace_id) or user_id = (select auth.uid()));

-- Y las exclusiones: las pone quien manda, y cada uno ve las suyas.
drop policy if exists "cada uno ve sus exclusiones" on public.product_exclusions;
create policy "cada uno ve sus exclusiones" on public.product_exclusions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.manda_en(workspace_id));

drop policy if exists "quien manda excluye" on public.product_exclusions;
create policy "quien manda excluye" on public.product_exclusions
  for insert to authenticated
  with check (public.manda_en(workspace_id));

drop policy if exists "quien manda devuelve" on public.product_exclusions;
create policy "quien manda devuelve" on public.product_exclusions
  for delete to authenticated
  using (public.manda_en(workspace_id));

-- Los espacios: verlos si eres miembro, renombrarlos si mandas.
drop policy if exists "quien manda renombra" on public.workspaces;
create policy "quien manda renombra" on public.workspaces
  for update to authenticated
  using (public.manda_en(id))
  with check (public.manda_en(id));
