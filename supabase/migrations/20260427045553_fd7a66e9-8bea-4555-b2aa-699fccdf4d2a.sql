-- Create public bucket for job banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-banners', 'job-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Job banners are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'job-banners');

-- Authenticated upload/update/delete
CREATE POLICY "Authenticated users can upload job banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-banners');

CREATE POLICY "Authenticated users can update job banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'job-banners');

CREATE POLICY "Authenticated users can delete job banners"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'job-banners');