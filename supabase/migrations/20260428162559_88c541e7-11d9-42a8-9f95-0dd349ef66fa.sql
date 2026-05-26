ALTER TABLE public.job_candidates DROP CONSTRAINT IF EXISTS job_candidates_current_stage_check;

ALTER TABLE public.job_candidates ADD CONSTRAINT job_candidates_current_stage_check
  CHECK (current_stage = ANY (ARRAY[
    'novos','triagem','entrevista_agendada','entrevista_rh','entrevista_gestor',
    'teste_pratico','proposta','aguardando_inicio','documentacao_ok','cadastro',
    'agendar_treinamento','treinamento_iniciado',
    'treinamento_dia_1','treinamento_dia_2','treinamento_dia_3','treinamento_dia_4',
    'treinamento_dia_5','treinamento_dia_6','treinamento_dia_7',
    'contratado','reprovado','desistiu','talento_futuro','rejeitado'
  ]::text[]));