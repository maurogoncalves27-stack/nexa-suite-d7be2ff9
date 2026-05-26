
-- Daily revenue table (per day x store x brand)
CREATE TABLE IF NOT EXISTS public.daily_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date date NOT NULL,
  store_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  gross_revenue numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (sale_date, store_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_revenue_date ON public.daily_revenue (sale_date);
CREATE INDEX IF NOT EXISTS idx_daily_revenue_store ON public.daily_revenue (store_id);
CREATE INDEX IF NOT EXISTS idx_daily_revenue_brand ON public.daily_revenue (brand_id);

ALTER TABLE public.daily_revenue ENABLE ROW LEVEL SECURITY;

-- Mirror monthly_revenue policies (any authenticated user can read/write)
CREATE POLICY "daily_revenue select authenticated"
ON public.daily_revenue FOR SELECT TO authenticated USING (true);

CREATE POLICY "daily_revenue insert authenticated"
ON public.daily_revenue FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "daily_revenue update authenticated"
ON public.daily_revenue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "daily_revenue delete authenticated"
ON public.daily_revenue FOR DELETE TO authenticated USING (true);

-- Updated-at trigger
CREATE TRIGGER trg_daily_revenue_updated_at
BEFORE UPDATE ON public.daily_revenue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: recompute monthly_revenue total from daily_revenue
CREATE OR REPLACE FUNCTION public.sync_monthly_from_daily()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_store uuid;
  v_brand uuid;
  v_year int;
  v_month int;
  v_total numeric;
  v_consolidated boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.sale_date; v_store := OLD.store_id; v_brand := OLD.brand_id;
  ELSE
    v_date := NEW.sale_date; v_store := NEW.store_id; v_brand := NEW.brand_id;
  END IF;

  v_year := EXTRACT(YEAR FROM v_date)::int;
  v_month := EXTRACT(MONTH FROM v_date)::int;

  -- Don't touch consolidated months
  SELECT is_consolidated INTO v_consolidated
  FROM public.monthly_revenue
  WHERE year = v_year AND month = v_month
    AND store_id = v_store AND brand_id = v_brand
  LIMIT 1;

  IF COALESCE(v_consolidated, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(gross_revenue), 0) INTO v_total
  FROM public.daily_revenue
  WHERE EXTRACT(YEAR FROM sale_date)::int = v_year
    AND EXTRACT(MONTH FROM sale_date)::int = v_month
    AND store_id = v_store AND brand_id = v_brand;

  INSERT INTO public.monthly_revenue (year, month, store_id, brand_id, gross_revenue, is_consolidated)
  VALUES (v_year, v_month, v_store, v_brand, v_total, false)
  ON CONFLICT (year, month, store_id, brand_id)
  DO UPDATE SET gross_revenue = EXCLUDED.gross_revenue, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_daily_revenue_sync_monthly
AFTER INSERT OR UPDATE OR DELETE ON public.daily_revenue
FOR EACH ROW EXECUTE FUNCTION public.sync_monthly_from_daily();
