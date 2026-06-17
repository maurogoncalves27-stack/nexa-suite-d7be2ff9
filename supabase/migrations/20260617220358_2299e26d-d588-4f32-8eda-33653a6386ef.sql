
-- ============================================================
-- NutriControle storage policies — normalização definitiva
-- ============================================================

-- Drop policies antigas conflitantes
DROP POLICY IF EXISTS "Nutri delete maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Nutri upload maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Nutricontrol staff delete" ON storage.objects;
DROP POLICY IF EXISTS "Nutricontrol staff insert" ON storage.objects;
DROP POLICY IF EXISTS "Nutricontrol staff read" ON storage.objects;
DROP POLICY IF EXISTS "Nutricontrol staff update" ON storage.objects;
DROP POLICY IF EXISTS "nutri_buckets_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutri_buckets_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_buckets_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_buckets_update" ON storage.objects;
DROP POLICY IF EXISTS "nutri_oil_disposal_receipts_delete" ON storage.objects;
DROP POLICY IF EXISTS "nutri_oil_disposal_receipts_insert" ON storage.objects;
DROP POLICY IF EXISTS "nutri_oil_disposal_receipts_select" ON storage.objects;
DROP POLICY IF EXISTS "nutri_oil_disposal_receipts_update" ON storage.objects;
DROP POLICY IF EXISTS "Nutri visit signatures - staff read" ON storage.objects;
DROP POLICY IF EXISTS "Nutri visit signatures - staff write" ON storage.objects;

-- Lista única de buckets do NutriControle
-- (qualquer staff autorizado tem leitura/escrita completa)
CREATE POLICY "nutricontrol_all_buckets_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN (
    'nutricontrol',
    'nutri-maintenance-photos',
    'nutri-oil-disposal-receipts',
    'nutri-pest-certificates',
    'nutri-water-reports',
    'nutri-visit-signatures'
  )
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutricontrol_all_buckets_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN (
    'nutricontrol',
    'nutri-maintenance-photos',
    'nutri-oil-disposal-receipts',
    'nutri-pest-certificates',
    'nutri-water-reports',
    'nutri-visit-signatures'
  )
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutricontrol_all_buckets_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN (
    'nutricontrol',
    'nutri-maintenance-photos',
    'nutri-oil-disposal-receipts',
    'nutri-pest-certificates',
    'nutri-water-reports',
    'nutri-visit-signatures'
  )
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
  )
)
WITH CHECK (
  bucket_id IN (
    'nutricontrol',
    'nutri-maintenance-photos',
    'nutri-oil-disposal-receipts',
    'nutri-pest-certificates',
    'nutri-water-reports',
    'nutri-visit-signatures'
  )
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

CREATE POLICY "nutricontrol_all_buckets_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN (
    'nutricontrol',
    'nutri-maintenance-photos',
    'nutri-oil-disposal-receipts',
    'nutri-pest-certificates',
    'nutri-water-reports',
    'nutri-visit-signatures'
  )
  AND (
    is_super_user(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'nutritionist'::app_role)
  )
);

-- Leitura pública mantida apenas para buckets que precisam de URL pública
CREATE POLICY "nutricontrol_public_read"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id IN (
    'nutri-maintenance-photos',
    'nutri-pest-certificates',
    'nutri-water-reports'
  )
);
