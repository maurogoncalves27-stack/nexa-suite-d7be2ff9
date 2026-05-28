CREATE OR REPLACE FUNCTION public._migration_set_triggers(p_enable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF p_enable THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER ALL', r.tablename);
    ELSE
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER ALL', r.tablename);
    END IF;
  END LOOP;
END;
$function$;