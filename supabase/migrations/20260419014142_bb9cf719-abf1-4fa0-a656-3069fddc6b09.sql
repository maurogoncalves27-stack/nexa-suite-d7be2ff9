ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID;

CREATE INDEX IF NOT EXISTS idx_contract_signatures_employee_active
  ON public.contract_signatures (employee_id, signed_at DESC)
  WHERE superseded_at IS NULL;