-- Quien se registra ahora necesita un espacio, o no ve nada.
--
-- La fase 1 creó un espacio para cada persona **que ya existía**. Con las
-- políticas de la fase 3 en marcha, quien se registre a partir de ahora no
-- pertenece a ninguno: no ve nada y tampoco puede crear nada, porque el
-- `with check` de INSERT también exige ser miembro.
--
-- No da ningún error entendible. Da una plataforma vacía donde no se puede
-- hacer nada, que se lee como «está rota» y no como «te falta un espacio».
--
-- El perfil ya lo crea un disparador al registrarse; el espacio va detrás, en el
-- mismo momento y por el mismo camino.
create or replace function public.crear_espacio_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo uuid;
begin
  -- Si ya es miembro de alguno no se toca: pasa si alguien le invitó antes de
  -- que se registrara, y darle uno propio lo dejaría en el equipo equivocado.
  if exists (select 1 from public.workspace_members m where m.user_id = new.id) then
    return new;
  end if;

  insert into public.workspaces (name, created_by)
  values ('Mi espacio', new.id)
  returning id into nuevo;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (nuevo, new.id, 'dueño');

  return new;
end;
$$;

drop trigger if exists crear_espacio on public.profiles;
create trigger crear_espacio
  after insert on public.profiles
  for each row execute function public.crear_espacio_al_registrarse();

-- Y por si alguien se registró entre la fase 3 y esto: se le da el suyo.
insert into public.workspaces (name, created_by)
select 'Mi espacio', p.id
from public.profiles p
where not exists (select 1 from public.workspace_members m where m.user_id = p.id);

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.created_by, 'dueño'
from public.workspaces w
where not exists (
  select 1 from public.workspace_members m
  where m.workspace_id = w.id and m.user_id = w.created_by
)
on conflict do nothing;
