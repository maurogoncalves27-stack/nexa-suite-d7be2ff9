
ALTER TABLE public.nutri_maintenance_requests
  DROP CONSTRAINT IF EXISTS nutri_maintenance_requests_status_check;

ALTER TABLE public.nutri_maintenance_requests
  ADD CONSTRAINT nutri_maintenance_requests_status_check
  CHECK (status IN ('pending','approved','rejected','completed','awaiting_confirmation'));

ALTER TABLE public.nutri_maintenance_requests
  ADD COLUMN IF NOT EXISTS resolved_note text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0;
