CREATE OR REPLACE FUNCTION public.enforce_daily_announcement_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bypass: avisos automáticos do sistema (holerites, etc.)
  IF NEW.title ILIKE 'Holerite de %' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.hr_announcements
  WHERE created_by = NEW.created_by
    AND created_at::date = (COALESCE(NEW.created_at, now()))::date
    AND title NOT ILIKE 'Holerite de %';

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Limite de 3 avisos por dia atingido. Tente novamente amanhã.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;