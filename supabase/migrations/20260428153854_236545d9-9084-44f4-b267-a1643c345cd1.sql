ALTER TABLE public.job_candidates DROP CONSTRAINT IF EXISTS job_candidates_current_stage_check;

ALTER TABLE public.job_candidates ADD CONSTRAINT job_candidates_current_stage_check
CHECK (current_stage = ANY (ARRAY[
  'novos'::text, 'triagem'::text, 'entrevista_agendada'::text, 'entrevista_rh'::text,
  'entrevista_gestor'::text, 'teste_pratico'::text, 'proposta'::text,
  'aguardando_inicio'::text, 'documentacao_ok'::text, 'cadastro'::text, 'contratado'::text,
  'reprovado'::text, 'desistiu'::text, 'talento_futuro'::text
]));