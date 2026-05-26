-- Função para limpar candidaturas analisadas há mais de 90 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_job_applications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.job_applications
  WHERE interview_status IN ('approved', 'rejected')
    AND COALESCE(reviewed_at, created_at) < (now() - interval '90 days');
END;
$$;

-- Agenda diária às 03:00 UTC (00:00 BRT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-job-applications') THEN
    PERFORM cron.unschedule('cleanup-old-job-applications');
  END IF;
  PERFORM cron.schedule(
    'cleanup-old-job-applications',
    '0 3 * * *',
    $cron$ SELECT public.cleanup_old_job_applications(); $cron$
  );
END $$;