-- Limpa batidas duplicadas: mantém somente as 270 recém-importadas dos PDFs.
-- Remove todas as batidas anteriores ao import (created_at < now() - 5min) de abril/2026 dos 5 colaboradores.
DELETE FROM public.time_clock_entries
WHERE employee_id IN (
  '4332a569-7f70-4bb0-9883-3a74d5c0c1e6',
  'bdef0c81-db2c-466d-a9a9-715adb286357',
  'e8b62de1-eea6-47ee-b01d-bdcf8d4b9de9',
  '0b65c917-9df8-443f-9bb4-f6fcbdc619c3',
  '486d6fbd-f509-4fd2-9159-aa127d27d094'
)
AND reference_date BETWEEN '2026-04-01' AND '2026-04-30'
AND created_at < (now() - interval '10 minutes');