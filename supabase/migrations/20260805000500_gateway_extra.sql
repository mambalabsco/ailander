-- Un coste extra por pasarela, encima del que ya se cobra.
--
-- ## Para qué
--
-- Porque la comisión declarada no siempre es todo lo que cuesta cobrar. Hay
-- pasarelas que suman un cargo por divisa, otras que cobran aparte el
-- antifraude, y algunas que facturan un porcentaje adicional que no aparece en
-- la tarifa pública.
--
-- Va como campos aparte y no sumado al porcentaje principal para que se pueda
-- ver de dónde sale cada cosa. Un 3,4 % que en realidad son 2,9 + 0,5 es
-- imposible de revisar seis meses después, y lo que se acaba haciendo es
-- volverlo a mirar en la factura.
alter table public.cost_gateway_fees
  add column if not exists extra_percent numeric not null default 0,
  add column if not exists extra_fixed numeric not null default 0;

comment on column public.cost_gateway_fees.extra_percent is
  'Porcentaje adicional al de la tarifa: divisa, antifraude, lo que no venga en la comisión base.';
comment on column public.cost_gateway_fees.extra_fixed is
  'Importe fijo adicional por pedido, encima del de la tarifa.';
