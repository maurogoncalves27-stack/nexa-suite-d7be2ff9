ALTER TABLE public.job_candidates
ADD COLUMN IF NOT EXISTS requested_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS documents_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS documents_requested_notes text;