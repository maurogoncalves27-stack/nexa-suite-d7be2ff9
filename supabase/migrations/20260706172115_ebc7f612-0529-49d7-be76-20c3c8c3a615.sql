CREATE OR REPLACE FUNCTION public.trg_vacation_schedule_auto_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url text := 'https://ixjgmerxxakdkfdzgumy.supabase.co';
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    BEGIN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/calculate-vacation-receipt',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('vacation_schedule_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto vacation receipt failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vacation_schedule_auto_receipt ON public.vacation_schedules;
CREATE TRIGGER trg_vacation_schedule_auto_receipt
AFTER INSERT OR UPDATE OF status ON public.vacation_schedules
FOR EACH ROW EXECUTE FUNCTION public.trg_vacation_schedule_auto_receipt();