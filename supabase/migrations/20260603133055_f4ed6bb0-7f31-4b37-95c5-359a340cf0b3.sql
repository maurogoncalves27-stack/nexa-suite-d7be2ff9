
CREATE OR REPLACE FUNCTION public._migration_storage_missing_count(
  p_bucket text, p_table text, p_col text
) RETURNS TABLE(total bigint, missing bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE q text;
BEGIN
  q := format(
    'SELECT count(*)::bigint AS total,
       count(*) FILTER (WHERE o.id IS NULL)::bigint AS missing
     FROM public.%I t
     LEFT JOIN storage.objects o
       ON o.bucket_id = %L AND o.name = t.%I
     WHERE t.%I IS NOT NULL AND t.%I <> ''''',
    p_table, p_bucket, p_col, p_col, p_col
  );
  RETURN QUERY EXECUTE q;
END $$;

CREATE OR REPLACE FUNCTION public._migration_storage_missing_paths(
  p_bucket text, p_table text, p_col text, p_offset int, p_limit int
) RETURNS TABLE(path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE q text;
BEGIN
  q := format(
    'SELECT DISTINCT t.%I::text AS path
     FROM public.%I t
     LEFT JOIN storage.objects o
       ON o.bucket_id = %L AND o.name = t.%I
     WHERE o.id IS NULL AND t.%I IS NOT NULL AND t.%I <> ''''
     ORDER BY 1
     OFFSET %s LIMIT %s',
    p_col, p_table, p_bucket, p_col, p_col, p_col, p_offset, p_limit
  );
  RETURN QUERY EXECUTE q;
END $$;

REVOKE ALL ON FUNCTION public._migration_storage_missing_count(text,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._migration_storage_missing_paths(text,text,text,int,int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._migration_storage_missing_count(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public._migration_storage_missing_paths(text,text,text,int,int) TO service_role;
