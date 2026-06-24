DROP TABLE IF EXISTS public.pos_sale_items CASCADE;
DROP TABLE IF EXISTS public.pos_sales CASCADE;
DROP TABLE IF EXISTS public.pos_sync_logs CASCADE;
DROP TABLE IF EXISTS public.pos_item_mappings CASCADE;
DROP FUNCTION IF EXISTS public.import_saipos_menu(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.import_saipos_menu(json) CASCADE;