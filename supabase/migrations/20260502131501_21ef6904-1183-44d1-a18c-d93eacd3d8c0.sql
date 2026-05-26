CREATE OR REPLACE FUNCTION public.cleanup_past_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH del AS (
    DELETE FROM public.appointments
    WHERE COALESCE(end_at, start_at) < (now() - interval '1 day')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del;
  RETURN v_deleted;
END;
$$;