-- 1) Campos de triagem por IA em job_candidates
ALTER TABLE public.job_candidates
  ADD COLUMN IF NOT EXISTS ai_score integer,
  ADD COLUMN IF NOT EXISTS ai_recommendation text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_concerns text,
  ADD COLUMN IF NOT EXISTS ai_screened_at timestamptz,
  ADD COLUMN IF NOT EXISTS interview_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS interview_slot_id uuid;

CREATE INDEX IF NOT EXISTS idx_job_candidates_stage_opening
  ON public.job_candidates (job_opening_id, current_stage);

CREATE INDEX IF NOT EXISTS idx_job_candidates_interview_at
  ON public.job_candidates (interview_scheduled_at)
  WHERE interview_scheduled_at IS NOT NULL;