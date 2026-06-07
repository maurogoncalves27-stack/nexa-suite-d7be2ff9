ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS pdv_print_layout jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.stores.pdv_print_layout IS 'Layout configurável da impressão do PDV: { header_text, footer_text, show_address, kitchen_show_prices, kitchen_double_size, kitchen_show_time, print_customer_copy, print_kitchen_copy }';
