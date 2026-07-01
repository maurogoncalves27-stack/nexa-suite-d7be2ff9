CREATE TABLE public.store_brand_google (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  place_id text,
  avg_rating numeric(3,2),
  total_ratings integer,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, brand_id)
);

GRANT SELECT ON public.store_brand_google TO authenticated;
GRANT ALL ON public.store_brand_google TO service_role;

ALTER TABLE public.store_brand_google ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read store_brand_google"
  ON public.store_brand_google FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_store_brand_google_updated
  BEFORE UPDATE ON public.store_brand_google
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();