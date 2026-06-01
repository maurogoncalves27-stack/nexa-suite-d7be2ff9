
-- 1) NFC-e fiscal credentials: revoke column-level SELECT on stores
REVOKE SELECT (nfce_csc_id, nfce_csc_token, nfce_csc_id_prod, nfce_csc_token_prod)
  ON public.stores FROM authenticated;
REVOKE SELECT (nfce_csc_id, nfce_csc_token, nfce_csc_id_prod, nfce_csc_token_prod)
  ON public.stores FROM anon;

-- 2) PDV: scope employee access by store
DROP POLICY IF EXISTS "pdv_orders_staff" ON public.pdv_orders;
CREATE POLICY "pdv_orders_staff" ON public.pdv_orders
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND user_can_access_store(auth.uid(), store_id))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND user_can_access_store(auth.uid(), store_id))
);

DROP POLICY IF EXISTS "pdv_cash_sessions_staff" ON public.pdv_cash_sessions;
CREATE POLICY "pdv_cash_sessions_staff" ON public.pdv_cash_sessions
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND user_can_access_store(auth.uid(), store_id))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND user_can_access_store(auth.uid(), store_id))
);

DROP POLICY IF EXISTS "pdv_order_items_staff" ON public.pdv_order_items;
CREATE POLICY "pdv_order_items_staff" ON public.pdv_order_items
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND EXISTS (
    SELECT 1 FROM public.pdv_orders o
    WHERE o.id = pdv_order_items.order_id
      AND user_can_access_store(auth.uid(), o.store_id)
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND EXISTS (
    SELECT 1 FROM public.pdv_orders o
    WHERE o.id = pdv_order_items.order_id
      AND user_can_access_store(auth.uid(), o.store_id)
  ))
);

DROP POLICY IF EXISTS "pdv_payments_staff" ON public.pdv_payments;
CREATE POLICY "pdv_payments_staff" ON public.pdv_payments
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND EXISTS (
    SELECT 1 FROM public.pdv_orders o
    WHERE o.id = pdv_payments.order_id
      AND user_can_access_store(auth.uid(), o.store_id)
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_user(auth.uid())
  OR (has_role(auth.uid(), 'employee'::app_role) AND EXISTS (
    SELECT 1 FROM public.pdv_orders o
    WHERE o.id = pdv_payments.order_id
      AND user_can_access_store(auth.uid(), o.store_id)
  ))
);

-- 3) Gas voucher: scope SELECT
DROP POLICY IF EXISTS "Authenticated reads gas requests" ON public.gas_voucher_requests;
CREATE POLICY "Authenticated reads gas requests" ON public.gas_voucher_requests
FOR SELECT TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_can_access_store(auth.uid(), store_id)
);

DROP POLICY IF EXISTS "Authenticated reads gas state" ON public.gas_voucher_store_state;
CREATE POLICY "Authenticated reads gas state" ON public.gas_voucher_store_state
FOR SELECT TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_can_access_store(auth.uid(), store_id)
);

-- gas_voucher_purchases has no store_id (central purchases) → restrict to admin/manager/super
DROP POLICY IF EXISTS "Authenticated reads gas purchases" ON public.gas_voucher_purchases;
CREATE POLICY "Staff reads gas purchases" ON public.gas_voucher_purchases
FOR SELECT TO authenticated
USING (
  is_super_user(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 4) Harden user_can_access_employee: null store_id → admin/super only
CREATE OR REPLACE FUNCTION public.user_can_access_employee(_user_id uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND (
        (e.store_id IS NULL AND (public.has_role(_user_id, 'admin'::app_role) OR public.is_super_user(_user_id)))
        OR (e.store_id IS NOT NULL AND public.user_can_access_store(_user_id, e.store_id))
      )
  );
$function$;
