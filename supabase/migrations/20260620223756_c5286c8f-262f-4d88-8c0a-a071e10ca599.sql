
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND pg_get_expr(polqual, polrelid) ILIKE '%nutri-oil-disposal-receipts%'
      AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.polname);
  END LOOP;
END $$;

CREATE POLICY "nutri-oil receipts read authorized"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nutri-oil-disposal-receipts'
  AND (
    public.has_role(auth.uid(), 'nutritionist'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.is_super_user(auth.uid())
  )
);
