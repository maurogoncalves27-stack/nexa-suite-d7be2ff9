
ALTER TABLE public.addon_options ADD COLUMN IF NOT EXISTS photo_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('addon-photos', 'addon-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Addon photos public read" ON storage.objects;
CREATE POLICY "Addon photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'addon-photos');

DROP POLICY IF EXISTS "Authenticated upload addon photos" ON storage.objects;
CREATE POLICY "Authenticated upload addon photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'addon-photos');

DROP POLICY IF EXISTS "Authenticated update addon photos" ON storage.objects;
CREATE POLICY "Authenticated update addon photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'addon-photos');

DROP POLICY IF EXISTS "Authenticated delete addon photos" ON storage.objects;
CREATE POLICY "Authenticated delete addon photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'addon-photos');
