ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS serves_people numeric,
  ADD COLUMN IF NOT EXISTS total_weight_g numeric,
  ADD COLUMN IF NOT EXISTS protein_weight_g numeric;