CREATE OR REPLACE FUNCTION public.user_accessible_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Loja vinculada no perfil
  SELECT public.get_user_store(_user_id)
   WHERE public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Loja real vinculada no cadastro do colaborador
  SELECT COALESCE(e.allocated_store_id, e.store_id)
    FROM public.employees e
   WHERE e.user_id = _user_id
     AND COALESCE(e.allocated_store_id, e.store_id) IS NOT NULL
     AND e.status IN ('active', 'in_training')
  UNION
  -- Filiais virtuais da loja vinculada no perfil
  SELECT s.id
    FROM public.stores s
   WHERE s.parent_store_id = public.get_user_store(_user_id)
     AND public.get_user_store(_user_id) IS NOT NULL
  UNION
  -- Filiais virtuais da loja vinculada no cadastro do colaborador
  SELECT s.id
    FROM public.stores s
    JOIN public.employees e ON s.parent_store_id = COALESCE(e.allocated_store_id, e.store_id)
   WHERE e.user_id = _user_id
     AND e.status IN ('active', 'in_training')
     AND COALESCE(e.allocated_store_id, e.store_id) IS NOT NULL
  UNION
  -- Lojas extras concedidas pelo override
  SELECT unnest(extra_store_ids)
    FROM public.user_access_overrides
   WHERE user_id = _user_id;
$$;

DROP POLICY IF EXISTS "Receivers insert invoices for own store" ON public.inventory_invoices;

CREATE POLICY "Receivers insert invoices for accessible store"
ON public.inventory_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND public.user_can_access_store(auth.uid(), store_id)
);

DROP POLICY IF EXISTS "Receivers insert payables for own invoice" ON public.accounts_payable;

CREATE POLICY "Receivers insert payables for accessible store"
ON public.accounts_payable
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_receive_inventory(auth.uid())
  AND created_by = auth.uid()
  AND public.user_can_access_store(auth.uid(), store_id)
  AND (
    invoice_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.inventory_invoices i
      WHERE i.id = accounts_payable.invoice_id
        AND i.store_id = accounts_payable.store_id
        AND (
          i.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')
        )
    )
  )
);