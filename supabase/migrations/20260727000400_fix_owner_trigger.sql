-- ============================================================================
-- Corrección: `assert_same_owner` fallaba en cuanto se usaba
-- ============================================================================
--
-- La versión anterior hacía esto:
--
--     if tg_argv[0] = 'store_id' and new.store_id is not null then ...
--     elsif tg_argv[0] = 'product_id' and new.product_id is not null then ...
--
-- dando por hecho que plpgsql resolvería `new.<campo>` solo en la rama que se
-- ejecuta. **No es así**: plpgsql compila la función contra el tipo de fila de
-- la tabla a la que está enganchado el trigger y valida *todas* las referencias
-- a `new.x`, incluidas las de ramas que nunca se van a ejecutar.
--
-- Resultado: insertar en `products` —que tiene `store_id` y `market_id` pero no
-- `product_id`— reventaba con «record "new" has no field "product_id"». Es
-- decir, la comprobación de coherencia no solo no protegía: impedía dar de alta
-- productos, notas, imágenes y todo lo demás.
--
-- Lo encontró la prueba de aislamiento entre dos cuentas, no el compilador ni
-- el arranque de la aplicación: sin insertar una fila de verdad, este error no
-- aparece por ningún lado.
--
-- La solución es no nombrar campos en el código: `to_jsonb(new)` convierte la
-- fila en un objeto y se busca la clave por nombre, que funcione o no la tabla
-- tenga esa columna.

create or replace function public.assert_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_column text := tg_argv[0];
  target_id uuid;
  owner_id uuid;
  row_json jsonb;
begin
  -- Sin nombrar la columna en el código, plpgsql no intenta resolverla contra
  -- el tipo de la tabla y la misma función sirve para todas.
  row_json := to_jsonb(new);
  target_id := nullif(row_json ->> target_column, '')::uuid;

  if target_id is null then
    return new;
  end if;

  if target_column = 'store_id' then
    select user_id into owner_id from public.stores where id = target_id;
  elsif target_column = 'market_id' then
    select user_id into owner_id from public.store_markets where id = target_id;
  elsif target_column = 'product_id' then
    select user_id into owner_id from public.products where id = target_id;
  else
    return new;
  end if;

  if owner_id is not null and owner_id <> (row_json ->> 'user_id')::uuid then
    raise exception 'La fila referenciada pertenece a otro usuario.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
