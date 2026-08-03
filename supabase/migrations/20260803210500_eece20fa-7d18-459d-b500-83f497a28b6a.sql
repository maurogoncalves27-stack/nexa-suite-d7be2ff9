select cron.alter_job(2, command := $cmd$
  select net.http_post(
    url := 'https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/ems-ingest',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4amdtZXJ4eGFrZGtmZHpndW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Nzc0MDcsImV4cCI6MjA5NTM1MzQwN30.P6TOFgTyYCz1BpDiPZKucHwBAE8CMo8JqId7s4sYtAA","x-cron-secret":"sOnIHGHcMjTkg-PhHi2dsjEXuDZlH3HyYOVRtTiDDWQ6ZexjMN_DXLeVX6q0PmJw"}'::jsonb,
    body := '{"lookback_hours":6}'::jsonb
  );
$cmd$);