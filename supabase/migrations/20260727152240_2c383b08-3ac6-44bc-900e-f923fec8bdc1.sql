
select cron.unschedule(jobid) from cron.job where jobname = 'zapi-health-check-every-10min';

select cron.schedule(
  'zapi-health-check-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/zapi-health-check',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb
  );
  $$
);
