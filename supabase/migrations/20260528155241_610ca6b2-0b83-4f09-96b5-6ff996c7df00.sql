ALTER TABLE public.dfe_inbound_items
  ADD COLUMN IF NOT EXISTS suggested_confidence numeric,
  ADD COLUMN IF NOT EXISTS trib_unit text,
  ADD COLUMN IF NOT EXISTS trib_quantity numeric,
  ADD COLUMN IF NOT EXISTS trib_unit_value numeric,
  ADD COLUMN IF NOT EXISTS suggested_pack_size numeric,
  ADD COLUMN IF NOT EXISTS suggested_pack_unit text;