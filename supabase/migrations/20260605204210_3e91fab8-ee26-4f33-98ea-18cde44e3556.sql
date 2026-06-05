ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS experience_initial_days integer,
  ADD COLUMN IF NOT EXISTS experience_extension_days integer;

UPDATE public.employees
   SET experience_initial_days = experience_contract_days
 WHERE experience_initial_days IS NULL
   AND experience_contract_days IS NOT NULL;