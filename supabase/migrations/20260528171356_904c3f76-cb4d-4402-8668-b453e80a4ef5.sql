
CREATE OR REPLACE FUNCTION public._migration_list_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH t AS (
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  f AS (
    SELECT
      con.conrelid::regclass::text AS tname,
      con.confrelid::regclass::text AS rname
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE con.contype = 'f' AND n.nspname = 'public'
  )
  SELECT jsonb_build_object(
    'tables', COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM t), '[]'::jsonb),
    'fks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      't', regexp_replace(tname, '^public\.', ''),
      'ref', regexp_replace(rname, '^public\.', '')
    )) FROM f), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public._migration_list_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._migration_list_tables() TO service_role;

CREATE OR REPLACE FUNCTION public._migration_set_triggers(p_enable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF p_enable THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', r.tablename);
    ELSE
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', r.tablename);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._migration_set_triggers(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._migration_set_triggers(boolean) TO service_role;
