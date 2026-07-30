-- ---------------------------------------------------------------------------
-- Las escenas visuales que se sacaron de cada copy.
--
-- Se guardan **las escenas y no los prompts**. La diferencia importa: extraer
-- las escenas cuesta una llamada al modelo y depende del texto, mientras que
-- convertir una escena en prompt es una función pura. Guardando lo caro y
-- recalculando lo barato, cualquier mejora en las reglas de composición —lo
-- prohibido, el formato, la intensidad— se aplica a todo el histórico sin
-- volver a pagar ninguna extracción.
--
-- Van en la fila del copy y no en una tabla aparte porque pertenecen a él: si
-- el copy se borra, sus escenas no significan nada.
-- ---------------------------------------------------------------------------

alter table public.copies
  -- [{kind, quote, scene, composition}]
  add column if not exists story_beats jsonb not null default '[]'::jsonb,
  -- Con qué intensidad se extrajeron, para poder enseñarlo y repetirlo igual.
  add column if not exists beats_intensity text;
