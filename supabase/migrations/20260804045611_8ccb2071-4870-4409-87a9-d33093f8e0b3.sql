DROP POLICY IF EXISTS "Public can view recipe book photos" ON storage.objects;
CREATE POLICY "Signed-in users can view recipe book photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'recipe-book-photos');

DROP POLICY IF EXISTS "Recipe photos public read" ON storage.objects;
CREATE POLICY "Signed-in users can view recipe photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'recipe-photos');