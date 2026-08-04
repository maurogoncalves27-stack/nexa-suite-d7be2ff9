DO $$
DECLARE
  r record;
  q text;
  wc text;
  v_cmd text;
  roles_txt text;
  perm text;
  parts text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual LIKE '%auth.uid()%')
        OR (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%')
      )
  LOOP
    -- protect already-wrapped occurrences, wrap the rest, then restore
    q := r.qual;
    wc := r.with_check;

    IF q IS NOT NULL THEN
      q := replace(q, '( SELECT auth.uid() AS uid)', '@@WRAPPED@@');
      q := replace(q, '(SELECT auth.uid())', '@@WRAPPED@@');
      q := replace(q, 'auth.uid()', '(SELECT auth.uid())');
      q := replace(q, '@@WRAPPED@@', '(SELECT auth.uid())');
    END IF;

    IF wc IS NOT NULL THEN
      wc := replace(wc, '( SELECT auth.uid() AS uid)', '@@WRAPPED@@');
      wc := replace(wc, '(SELECT auth.uid())', '@@WRAPPED@@');
      wc := replace(wc, 'auth.uid()', '(SELECT auth.uid())');
      wc := replace(wc, '@@WRAPPED@@', '(SELECT auth.uid())');
    END IF;

    -- nothing changed, skip
    IF q IS NOT DISTINCT FROM r.qual AND wc IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;
    END IF;

    v_cmd := r.cmd;
    perm := CASE WHEN r.permissive = 'RESTRICTIVE' THEN 'AS RESTRICTIVE' ELSE 'AS PERMISSIVE' END;
    roles_txt := array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) AS x), ', ');
    IF roles_txt IS NULL OR roles_txt = '' THEN
      roles_txt := 'public';
    END IF;

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    parts := format('CREATE POLICY %I ON %I.%I %s FOR %s TO %s',
                    r.policyname, r.schemaname, r.tablename, perm, v_cmd, roles_txt);

    IF q IS NOT NULL THEN
      parts := parts || format(' USING (%s)', q);
    END IF;
    IF wc IS NOT NULL THEN
      parts := parts || format(' WITH CHECK (%s)', wc);
    END IF;

    EXECUTE parts;
  END LOOP;
END $$;