ALTER TABLE public.user_access_overrides
  ADD COLUMN IF NOT EXISTS can_receive_invoices boolean NOT NULL DEFAULT false;

INSERT INTO public.user_access_overrides (user_id, can_receive_invoices)
SELECT DISTINCT e.user_id, true
FROM public.employees e
JOIN public.inventory_receiving_positions irp ON irp.position = e.position
WHERE e.user_id IS NOT NULL
  AND e.status IN ('active', 'in_training')
ON CONFLICT (user_id) DO UPDATE
  SET can_receive_invoices = true;