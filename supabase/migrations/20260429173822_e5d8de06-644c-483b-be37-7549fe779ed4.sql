ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS competence_date date,
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_recurrence_group
  ON public.accounts_payable(recurrence_group_id);