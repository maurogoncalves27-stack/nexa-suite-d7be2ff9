
-- ============================================================
-- Faturamento: unificar fonte de verdade em daily_revenue
-- (1) Migrar histórico monthly_revenue (day filled) -> daily_revenue
-- (2) Trigger novo: sync grava monthly_revenue por dia (não agregado mensal)
-- ============================================================

-- (1) Backfill: copia rows com day preenchido para daily_revenue
-- Usa dia 1 como fallback impossível (não há dia 0 e CHECK exige >0).
-- Idempotente via ON CONFLICT (sale_date, store_id, brand_id).
INSERT INTO public.daily_revenue (sale_date, store_id, brand_id, gross_revenue, notes, created_by)
SELECT
  make_date(mr.year, mr.month, mr.day::int)        AS sale_date,
  mr.store_id,
  mr.brand_id,
  mr.gross_revenue,
  COALESCE(mr.notes, 'backfill monthly_revenue '|| mr.id::text) AS notes,
  mr.created_by
FROM public.monthly_revenue mr
WHERE mr.day IS NOT NULL
  AND mr.day BETWEEN 1 AND 31
  AND mr.store_id IS NOT NULL
  AND mr.brand_id IS NOT NULL
  AND NOT mr.is_consolidated
ON CONFLICT (sale_date, store_id, brand_id) DO NOTHING;

-- (2) Substitui o trigger: agora replica day-by-day em monthly_revenue.
-- Precisamos de UNIQUE incluindo `day` para o upsert funcionar por dia.
-- Remove o índice antigo (year, month, store, brand) e cria um novo que inclui day (com NULL distinct).
DROP INDEX IF EXISTS public.monthly_revenue_period_store_brand_uniq;

-- Tenta achar a constraint UNIQUE antiga e remover (pode ter nome variado)
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.monthly_revenue'::regclass AND contype='u'
  LOOP
    EXECUTE format('ALTER TABLE public.monthly_revenue DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- Novo índice único cobrindo day (NULL = mensal agregado/legado)
CREATE UNIQUE INDEX monthly_revenue_full_uniq
  ON public.monthly_revenue (year, month, COALESCE(day, 0), store_id, brand_id);

-- Trigger novo: sincroniza por dia, não mais agregado.
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
  v_day int;
  v_total numeric;
  v_consolidated boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.sale_date; v_store := OLD.store_id; v_brand := OLD.brand_id;
  ELSE
    v_date := NEW.sale_date; v_store := NEW.store_id; v_brand := NEW.brand_id;
  END IF;

  v_year  := EXTRACT(YEAR  FROM v_date)::int;
  v_month := EXTRACT(MONTH FROM v_date)::int;
  v_day   := EXTRACT(DAY   FROM v_date)::int;

  -- Respeita meses consolidados
  SELECT bool_or(is_consolidated) INTO v_consolidated
  FROM public.monthly_revenue
  WHERE year = v_year AND month = v_month;

  IF COALESCE(v_consolidated, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Soma daily_revenue do dia (pode ter várias linhas se houver duplicidade)
  SELECT COALESCE(SUM(gross_revenue), 0) INTO v_total
  FROM public.daily_revenue
  WHERE sale_date = v_date
    AND store_id = v_store
    AND brand_id = v_brand;

  IF v_total = 0 AND TG_OP = 'DELETE' THEN
    -- Apaga a linha do dia em monthly_revenue se não sobrou daily
    DELETE FROM public.monthly_revenue
    WHERE year = v_year AND month = v_month AND day = v_day
      AND store_id = v_store AND brand_id = v_brand
      AND NOT is_consolidated;
    -- Apaga também o agregado mensal legado (day NULL) se virou redundante
    RETURN OLD;
  END IF;

  -- Upsert por dia
  INSERT INTO public.monthly_revenue (year, month, day, store_id, brand_id, gross_revenue, is_consolidated)
  VALUES (v_year, v_month, v_day, v_store, v_brand, v_total, false)
  ON CONFLICT (year, month, COALESCE(day, 0), store_id, brand_id)
  DO UPDATE SET gross_revenue = EXCLUDED.gross_revenue, updated_at = now();

  -- Se existir um agregado mensal antigo (day NULL) para essa combinação, remove
  DELETE FROM public.monthly_revenue
  WHERE year = v_year AND month = v_month AND day IS NULL
    AND store_id = v_store AND brand_id = v_brand
    AND NOT is_consolidated;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Re-cria o trigger (CREATE OR REPLACE FUNCTION não recria trigger)
DROP TRIGGER IF EXISTS trg_daily_revenue_sync_monthly ON public.daily_revenue;
CREATE TRIGGER trg_daily_revenue_sync_monthly
AFTER INSERT OR UPDATE OR DELETE ON public.daily_revenue
FOR EACH ROW EXECUTE FUNCTION public.sync_monthly_from_daily();

-- (1b) Re-sync mai/jun 2026: para cada (store, brand) com daily, gera 1 row por dia em monthly_revenue
-- e apaga o agregado day=NULL antigo.
WITH per_day AS (
  SELECT
    EXTRACT(YEAR FROM sale_date)::int  AS year,
    EXTRACT(MONTH FROM sale_date)::int AS month,
    EXTRACT(DAY FROM sale_date)::int   AS day,
    store_id, brand_id,
    SUM(gross_revenue) AS total
  FROM public.daily_revenue
  GROUP BY 1,2,3,4,5
)
INSERT INTO public.monthly_revenue (year, month, day, store_id, brand_id, gross_revenue, is_consolidated)
SELECT year, month, day, store_id, brand_id, total, false
FROM per_day
ON CONFLICT (year, month, COALESCE(day, 0), store_id, brand_id)
DO UPDATE SET gross_revenue = EXCLUDED.gross_revenue, updated_at = now();

-- Apaga agregados mensais day=NULL onde já existe granularidade diária
DELETE FROM public.monthly_revenue mr
WHERE mr.day IS NULL
  AND NOT mr.is_consolidated
  AND EXISTS (
    SELECT 1 FROM public.monthly_revenue mr2
    WHERE mr2.year = mr.year AND mr2.month = mr.month
      AND mr2.store_id = mr.store_id AND mr2.brand_id = mr.brand_id
      AND mr2.day IS NOT NULL
  );
