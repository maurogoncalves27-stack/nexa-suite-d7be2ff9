ALTER TABLE public.work_schedules
  ADD COLUMN IF NOT EXISTS is_home_office boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.work_schedules.is_home_office IS 'Indica que neste dia o colaborador trabalha em home office (não precisa bater ponto presencial).';