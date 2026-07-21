
ALTER TABLE public.promotion_history 
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

-- Backfill: registros antigos já foram aplicados
UPDATE public.promotion_history
SET effective_date = COALESCE(effective_date, created_at::date),
    applied_at = COALESCE(applied_at, created_at)
WHERE applied_at IS NULL AND effective_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_history_pending
  ON public.promotion_history (effective_date)
  WHERE applied_at IS NULL;

-- Função que aplica promoções pendentes cuja data efetiva já chegou
CREATE OR REPLACE FUNCTION public.apply_pending_promotions()
RETURNS TABLE(applied_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  cnt int := 0;
BEGIN
  FOR rec IN
    SELECT * FROM public.promotion_history
    WHERE applied_at IS NULL
      AND effective_date IS NOT NULL
      AND effective_date <= CURRENT_DATE
    ORDER BY effective_date, created_at
  LOOP
    IF rec.promotion_type = 'horizontal' THEN
      UPDATE public.employees
      SET current_level = rec.to_level,
          level_updated_at = rec.effective_date::timestamptz,
          salary = rec.to_salary
      WHERE id = rec.employee_id;
    ELSIF rec.promotion_type = 'vertical' THEN
      UPDATE public.employees
      SET position_id = rec.to_position_id,
          current_level = COALESCE(rec.to_level, 'I'),
          level_updated_at = rec.effective_date::timestamptz,
          salary = rec.to_salary
      WHERE id = rec.employee_id;
    END IF;

    UPDATE public.promotion_history
    SET applied_at = now()
    WHERE id = rec.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN QUERY SELECT cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_pending_promotions() TO authenticated, service_role;

-- Cron diário aplicando promoções que atingiram data efetiva
SELECT cron.unschedule('apply-pending-promotions-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apply-pending-promotions-daily');

SELECT cron.schedule(
  'apply-pending-promotions-daily',
  '5 3 * * *',
  $$SELECT public.apply_pending_promotions();$$
);
