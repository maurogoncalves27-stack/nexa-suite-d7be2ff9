ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS is_virtual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_stores_is_virtual ON public.stores(is_virtual);
CREATE INDEX IF NOT EXISTS idx_stores_parent_store_id ON public.stores(parent_store_id);