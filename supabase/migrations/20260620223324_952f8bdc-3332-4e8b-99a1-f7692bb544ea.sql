
-- Fix 1: Inventory invoice receivers must re-validate store access on UPDATE
DROP POLICY IF EXISTS "Receivers update own invoices" ON public.inventory_invoices;
CREATE POLICY "Receivers update own invoices"
ON public.inventory_invoices
FOR UPDATE
USING (
  can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND user_can_access_store(auth.uid(), store_id)
)
WITH CHECK (
  can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND user_can_access_store(auth.uid(), store_id)
);

-- Fix 2: Outsourced professional self-update — block changes to approval fields.
-- The previous policy compared outsourced_professionals_1.id = outsourced_professionals_1.id
-- (always true), so the guard was ineffective. Replace with a SECURITY DEFINER guard
-- that reads the persisted row and compares to NEW values via WITH CHECK.

CREATE OR REPLACE FUNCTION public.outsourced_self_update_keeps_approval(
  _id uuid,
  _approval_status text,
  _approved_at timestamptz,
  _approved_by uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.outsourced_professionals o
    WHERE o.id = _id
      AND o.approval_status IS NOT DISTINCT FROM _approval_status
      AND o.approved_at      IS NOT DISTINCT FROM _approved_at
      AND o.approved_by      IS NOT DISTINCT FROM _approved_by
  );
$$;

DROP POLICY IF EXISTS "Terceirizado edita seu próprio cadastro" ON public.outsourced_professionals;
CREATE POLICY "Terceirizado edita seu próprio cadastro"
ON public.outsourced_professionals
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND public.outsourced_self_update_keeps_approval(
    id, approval_status, approved_at, approved_by
  )
);
