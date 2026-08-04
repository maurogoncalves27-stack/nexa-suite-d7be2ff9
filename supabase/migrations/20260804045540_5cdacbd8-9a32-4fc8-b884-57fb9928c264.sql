DROP POLICY IF EXISTS "Public can view freelancer photos" ON storage.objects;

CREATE POLICY "Signed-in users can view freelancer photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'freelancer-photos');