
CREATE TABLE public.manual_platform_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('ifood','google','nutri')),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  brand text,
  week_start date NOT NULL,
  score numeric(3,2) NOT NULL CHECK (score >= 0 AND score <= 5),
  reviews_count integer,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, store_id, brand, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_platform_ratings TO authenticated;
GRANT ALL ON public.manual_platform_ratings TO service_role;

ALTER TABLE public.manual_platform_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read manual_platform_ratings"
  ON public.manual_platform_ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert manual_platform_ratings"
  ON public.manual_platform_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update manual_platform_ratings"
  ON public.manual_platform_ratings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete manual_platform_ratings"
  ON public.manual_platform_ratings FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_manual_platform_ratings_updated_at
  BEFORE UPDATE ON public.manual_platform_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_manual_platform_ratings_lookup
  ON public.manual_platform_ratings (source, store_id, week_start DESC);
