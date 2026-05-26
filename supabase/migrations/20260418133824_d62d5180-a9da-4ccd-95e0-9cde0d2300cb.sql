ALTER TABLE public.employee_warnings
  ADD COLUMN IF NOT EXISTS signature_ip text,
  ADD COLUMN IF NOT EXISTS signature_user_agent text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS signed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS refused_by_user_id uuid;