
-- 1. Colunas de controle do aviso
ALTER TABLE public.vacation_schedules
  ADD COLUMN IF NOT EXISTS notice_pdf_url text,
  ADD COLUMN IF NOT EXISTS notice_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notice_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS notice_acknowledged_ip text;

-- 2. RPC para o colaborador dar ciência do aviso
CREATE OR REPLACE FUNCTION public.acknowledge_vacation_notice(
  _schedule_id uuid,
  _ip text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT e.user_id INTO v_owner
  FROM public.vacation_schedules vs
  JOIN public.employees e ON e.id = vs.employee_id
  WHERE vs.id = _schedule_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.vacation_schedules
  SET notice_acknowledged_at = COALESCE(notice_acknowledged_at, now()),
      notice_acknowledged_ip = COALESCE(notice_acknowledged_ip, _ip)
  WHERE id = _schedule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_vacation_notice(uuid, text) TO authenticated;

-- 3. Trigger atualizado: chama recibo E aviso ao aprovar
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
    -- Recibo de pagamento
    BEGIN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/calculate-vacation-receipt',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('vacation_schedule_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto vacation receipt failed: %', SQLERRM;
    END;
    -- Aviso prévio de férias
    BEGIN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/generate-vacation-notice',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('vacation_schedule_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto vacation notice failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
