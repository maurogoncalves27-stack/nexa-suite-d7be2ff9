-- Remove colunas legadas de conversão de compra do produto.
-- Fonte única de fatores agora é a tabela product_conversions (tipo 'compra').
-- Backfill já foi executado em migração anterior; SELECT confirmou 0 registros pendentes.

ALTER TABLE public.inventory_products DROP COLUMN IF EXISTS purchase_unit;
ALTER TABLE public.inventory_products DROP COLUMN IF EXISTS pack_size;