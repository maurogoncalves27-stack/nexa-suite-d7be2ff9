
-- 1) delivery_jobs: scope read to store
DROP POLICY IF EXISTS "Staff read delivery jobs" ON public.delivery_jobs;
CREATE POLICY "Staff read delivery jobs"
  ON public.delivery_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.user_can_access_store(auth.uid(), store_id)
  );

-- 2) storage: nutri_buckets_select must not cover nutri-visit-signatures
DROP POLICY IF EXISTS "nutri_buckets_select" ON storage.objects;
CREATE POLICY "nutri_buckets_select"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = ANY (ARRAY['nutri-pest-certificates'::text, 'nutri-water-reports'::text]));

-- 3) storage: petty-cash-receipts read restricted to admin/manager
DROP POLICY IF EXISTS "Authenticated reads petty cash receipts" ON storage.objects;
CREATE POLICY "Staff reads petty cash receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'petty-cash-receipts'
    AND (
      public.is_super_user(auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

-- 4) stores: drop unused NFC-e CSC columns (canonical values live in store_fiscal_credentials)
ALTER TABLE public.stores
  DROP COLUMN IF EXISTS nfce_csc_id,
  DROP COLUMN IF EXISTS nfce_csc_token,
  DROP COLUMN IF EXISTS nfce_csc_id_prod,
  DROP COLUMN IF EXISTS nfce_csc_token_prod;

-- 5) totem_assets: restrict writes to admin/manager
DROP POLICY IF EXISTS "Authenticated staff can insert totem assets" ON public.totem_assets;
DROP POLICY IF EXISTS "Authenticated staff can update totem assets" ON public.totem_assets;
DROP POLICY IF EXISTS "Authenticated staff can delete totem assets" ON public.totem_assets;

CREATE POLICY "Admins/managers insert totem assets"
  ON public.totem_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins/managers update totem assets"
  ON public.totem_assets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins/managers delete totem assets"
  ON public.totem_assets
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );
