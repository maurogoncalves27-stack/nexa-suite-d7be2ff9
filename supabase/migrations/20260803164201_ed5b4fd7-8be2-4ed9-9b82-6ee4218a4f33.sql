ALTER TABLE public.nutri_maintenance_requests
  ADD COLUMN IF NOT EXISTS seen_by uuid,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz;