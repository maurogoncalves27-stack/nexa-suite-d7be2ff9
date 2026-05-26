-- Habilitar extensões necessárias para agendamento
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover agendamento anterior se existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('ensure-climate-survey-semestral');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Agendar para rodar à meia-noite (UTC) do dia 1 de janeiro e 1 de julho
SELECT cron.schedule(
  'ensure-climate-survey-semestral',
  '0 0 1 1,7 *',
  $$ SELECT public.ensure_current_climate_survey(); $$
);

-- Garantir que a pesquisa do semestre atual existe agora
SELECT public.ensure_current_climate_survey();