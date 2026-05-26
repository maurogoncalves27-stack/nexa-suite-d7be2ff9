DO $$ BEGIN
  CREATE TYPE public.termination_reason AS ENUM (
    'dismissal_without_cause',
    'employee_resignation',
    'dismissal_with_cause',
    'end_of_trial_contract',
    'end_of_fixed_term',
    'mutual_agreement_484a'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS termination_reason public.termination_reason;