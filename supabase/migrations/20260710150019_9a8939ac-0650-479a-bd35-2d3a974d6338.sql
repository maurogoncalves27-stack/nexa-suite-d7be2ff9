CREATE TABLE public.dre_historical_snapshot (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  store_key TEXT NOT NULL,
  line_key TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, month, store_key, line_key)
);

CREATE INDEX idx_dre_hist_period ON public.dre_historical_snapshot (year, month);
CREATE INDEX idx_dre_hist_store ON public.dre_historical_snapshot (store_key);

GRANT SELECT ON public.dre_historical_snapshot TO authenticated;
GRANT ALL ON public.dre_historical_snapshot TO service_role;

ALTER TABLE public.dre_historical_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read DRE historical snapshot"
ON public.dre_historical_snapshot FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super user can manage DRE historical snapshot"
ON public.dre_historical_snapshot FOR ALL
TO authenticated
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

CREATE TRIGGER update_dre_hist_updated_at
BEFORE UPDATE ON public.dre_historical_snapshot
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();