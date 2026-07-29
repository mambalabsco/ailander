-- ---------------------------------------------------------------------------
-- Ingredientes con su mecanismo.
--
-- `products.ingredients` guardaba solo nombres, y además **no llegaba a ningún
-- prompt**: se escribía en el formulario y no lo leía nadie.
--
-- Un copy que cierre bien necesita decir qué hace cada ingrediente y por qué esa
-- forma concreta —«selenometionina, no selenito barato»—, que es justo lo que
-- distingue el producto de los genéricos con el mismo ingrediente en una forma
-- que no se absorbe.
--
-- JSONB y no una tabla aparte: son unos pocos por producto, se leen y escriben
-- siempre juntos, y no hay ninguna consulta que los cruce por su cuenta.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists ingredient_details jsonb;
