-- Add photo_path to inventory products (used as menu items)
ALTER TABLE public.inventory_products
ADD COLUMN IF NOT EXISTS photo_path TEXT;

-- Create public bucket for menu item photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-photos', 'menu-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for menu-photos bucket
CREATE POLICY "Menu photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'menu-photos');

CREATE POLICY "Authenticated users can upload menu photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'menu-photos');

CREATE POLICY "Authenticated users can update menu photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'menu-photos');

CREATE POLICY "Authenticated users can delete menu photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'menu-photos');