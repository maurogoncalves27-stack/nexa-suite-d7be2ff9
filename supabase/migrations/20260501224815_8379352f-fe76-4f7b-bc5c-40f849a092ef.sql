-- 1) Adiciona vínculo com vaga
ALTER TABLE public.internships
ADD COLUMN IF NOT EXISTS job_opening_id uuid REFERENCES public.job_openings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internships_job_opening ON public.internships(job_opening_id);

-- 2) Remove vínculo antigo
ALTER TABLE public.internships DROP COLUMN IF EXISTS program_id;

-- 3) Remove tabela de programas
DROP TABLE IF EXISTS public.internship_programs CASCADE;