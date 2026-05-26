
ALTER TABLE public.training_receipts
  ADD COLUMN IF NOT EXISTS signature_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS signed_user_agent text;

CREATE POLICY "Employees can view their own training receipts"
ON public.training_receipts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = training_receipts.employee_id
      AND e.user_id = auth.uid()
  )
);

CREATE POLICY "Employees can sign their own training receipts"
ON public.training_receipts
FOR UPDATE
USING (
  signature_required_at IS NOT NULL
  AND signed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = training_receipts.employee_id
      AND e.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = training_receipts.employee_id
      AND e.user_id = auth.uid()
  )
);
