CREATE OR REPLACE FUNCTION public.enforce_daily_announcement_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.hr_announcements
  WHERE created_by = NEW.created_by
    AND created_at::date = (COALESCE(NEW.created_at, now()))::date;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Limite de 3 avisos por dia atingido. Tente novamente amanhã.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_daily_announcement_limit ON public.hr_announcements;
CREATE TRIGGER trg_enforce_daily_announcement_limit
BEFORE INSERT ON public.hr_announcements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_daily_announcement_limit();