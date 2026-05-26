-- Recria o trigger de sincronização daily_revenue → monthly_revenue
-- (a função existe mas o trigger não foi criado, deixando o monthly_revenue
-- com o último valor diário gravado pelo dialog manual em vez do total mensal)

DROP TRIGGER IF EXISTS trg_daily_revenue_sync_monthly ON public.daily_revenue;

CREATE TRIGGER trg_daily_revenue_sync_monthly
AFTER INSERT OR UPDATE OR DELETE ON public.daily_revenue
FOR EACH ROW EXECUTE FUNCTION public.sync_monthly_from_daily();

-- Backfill: recalcula monthly_revenue a partir das somas reais de daily_revenue
-- (apenas linhas não consolidadas — não toca em meses já fechados)
WITH agg AS (
  SELECT
    EXTRACT(YEAR FROM sale_date)::int AS year,
    EXTRACT(MONTH FROM sale_date)::int AS month,
    store_id,
    brand_id,
    SUM(gross_revenue) AS gross_revenue
  FROM public.daily_revenue
  GROUP BY 1, 2, 3, 4
)
INSERT INTO public.monthly_revenue (year, month, store_id, brand_id, gross_revenue, is_consolidated)
SELECT a.year, a.month, a.store_id, a.brand_id, a.gross_revenue, false
FROM agg a
ON CONFLICT (year, month, store_id, brand_id)
DO UPDATE SET
  gross_revenue = EXCLUDED.gross_revenue,
  updated_at = now()
WHERE COALESCE(public.monthly_revenue.is_consolidated, false) = false;