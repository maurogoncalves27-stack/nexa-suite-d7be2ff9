ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS base_unit text;

UPDATE public.quotation_items SET base_unit = unit WHERE base_unit IS NULL;

ALTER TABLE public.quotation_bid_items
  ADD COLUMN IF NOT EXISTS pack_description text,
  ADD COLUMN IF NOT EXISTS pack_price numeric,
  ADD COLUMN IF NOT EXISTS pack_content_qty numeric,
  ADD COLUMN IF NOT EXISTS pack_content_unit text,
  ADD COLUMN IF NOT EXISTS min_order_packs numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_per_base_unit numeric
    GENERATED ALWAYS AS (
      CASE
        WHEN pack_price IS NOT NULL AND pack_content_qty IS NOT NULL AND pack_content_qty > 0
          THEN pack_price / pack_content_qty
        ELSE unit_price
      END
    ) STORED;

COMMENT ON COLUMN public.quotation_items.base_unit IS
  'Unidade de comparação para ranquear bids (ex.: KG, L, UN).';
COMMENT ON COLUMN public.quotation_bid_items.price_per_base_unit IS
  'Preço por unidade-base, calculado automaticamente. Usado para ranquear ofertas.';