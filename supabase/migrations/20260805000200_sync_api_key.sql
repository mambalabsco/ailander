-- La clave de Sync (lipsync), junto a las demás.
--
-- Va en `provider_configs` y no en una variable de entorno porque el entorno lo
-- toca quien entra al servidor, y la plataforma la usa gente que no entra. La
-- tabla ya está pensada para esto: **no tiene política de SELECT**, ni siquiera
-- para su dueño, así que la clave no se puede leer desde el navegador ni con un
-- fallo de XSS. Solo la lee el servidor con `service_role`.
alter table public.provider_configs
  add column if not exists sync_api_key text;

comment on column public.provider_configs.sync_api_key is
  'Clave de api.sync.so para el lipsync. Nunca se devuelve al cliente: la vista solo dice si existe.';

-- Y cuánto vale un crédito de Higgsfield, que depende del plan contratado.
--
-- No es un secreto, pero vive con lo demás porque se configura en la misma
-- pantalla y se lee en la misma consulta. Sin valor, el coste se enseña en
-- créditos y se dice que falta la tarifa: un precio en dólares inventado se
-- toma por medido.
alter table public.provider_configs
  add column if not exists higgsfield_usd_per_credit numeric;

comment on column public.provider_configs.higgsfield_usd_per_credit is
  'USD por crédito de Higgsfield, según el plan. Ultra son 3000 créditos por 99 USD al mes: 0,033.';
