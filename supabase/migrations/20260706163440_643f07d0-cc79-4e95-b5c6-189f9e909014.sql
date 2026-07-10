
-- 1) Trigger BEFORE INSERT/UPDATE: aprovada com end_date < hoje vira completed
CREATE OR REPLACE FUNCTION public.auto_complete_vacation_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.end_date < CURRENT_DATE THEN
    NEW.status := 'completed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_complete_vacation ON public.vacation_schedules;
CREATE TRIGGER trg_auto_complete_vacation
BEFORE INSERT OR UPDATE ON public.vacation_schedules
FOR EACH ROW
EXECUTE FUNCTION public.auto_complete_vacation_on_write();

-- 2) Função batch para cron diário
CREATE OR REPLACE FUNCTION public.auto_complete_past_vacations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.vacation_schedules
     SET status = 'completed'
   WHERE status = 'approved'
     AND end_date < CURRENT_DATE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 3) Agendar no cron diário (03:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('auto-complete-past-vacations') FROM cron.job WHERE jobname='auto-complete-past-vacations';
    PERFORM cron.schedule(
      'auto-complete-past-vacations',
      '0 3 * * *',
      $cron$ SELECT public.auto_complete_past_vacations(); $cron$
    );
  END IF;
END $$;
