ALTER TABLE public.job_candidates
  DROP CONSTRAINT IF EXISTS job_candidates_current_stage_check;

ALTER TABLE public.job_candidates
  ADD CONSTRAINT job_candidates_current_stage_check
  CHECK (current_stage = ANY (ARRAY[
    'novos'::text,
    'entrevista_agendada'::text,
    'aguardando_inicio'::text,
    'teste_pratico'::text,
    'contratado'::text,
    'reprovado'::text,
    'desistiu'::text,
    'talento_futuro'::text,
    -- legados
    'triagem'::text,
    'entrevista_rh'::text,
    'entrevista_gestor'::text,
    'proposta'::text
  ]));

ALTER TABLE public.candidate_stage_history
  DROP CONSTRAINT IF EXISTS candidate_stage_history_to_stage_check;
ALTER TABLE public.candidate_stage_history
  DROP CONSTRAINT IF EXISTS candidate_stage_history_from_stage_check;