-- Remover sobrecargas antigas de produce_recipe, manter apenas a v3 (com lote, validade e divergência)
DROP FUNCTION IF EXISTS public.produce_recipe(uuid, uuid, numeric, text);
DROP FUNCTION IF EXISTS public.produce_recipe(uuid, uuid, numeric, text, date, date, text);