-- Cron semanal: cobrança automática de docs pendentes
-- Roda toda segunda-feira às 12:00 UTC (09:00 BRT)
DO $$
DECLARE
  v_existing_jobid INTEGER;
BEGIN
  SELECT jobid INTO v_existing_jobid FROM cron.job WHERE jobname = 'auto-remind-pending-docs';
  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'auto-remind-pending-docs',
  '0 12 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://xmswsrhfofwhwtykjqef.supabase.co/functions/v1/auto-remind-pending-docs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);