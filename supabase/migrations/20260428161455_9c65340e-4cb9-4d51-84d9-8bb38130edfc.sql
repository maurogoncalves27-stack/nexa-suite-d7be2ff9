
ALTER TABLE public.training_schedules
  ADD COLUMN IF NOT EXISTS admission_exam_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admission_exam_requested_by UUID,
  ADD COLUMN IF NOT EXISTS admission_exam_document_id UUID REFERENCES public.employee_documents(id) ON DELETE SET NULL;
