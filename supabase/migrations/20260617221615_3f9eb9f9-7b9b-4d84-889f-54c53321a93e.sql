
-- 1) Revogar acesso de 'partner' a tabelas financeiras/POS sensíveis
-- Estratégia: dropar policies que usam is_partner() nessas tabelas.

DO $$
DECLARE
  r record;
  target_tables text[] := ARRAY[
    'bank_accounts','bank_transactions','bank_statements','bank_transfers',
    'monthly_revenue','pdv_orders','pdv_order_items','pdv_payments',
    'pdv_fiscal_invoices','pdv_channels'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(target_tables)
      AND (
        COALESCE(qual,'') ILIKE '%is_partner%'
        OR COALESCE(with_check,'') ILIKE '%is_partner%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2) customer_reviews: substituir INSERT permissivo
DROP POLICY IF EXISTS "Equipe insere avaliações" ON public.customer_reviews;

CREATE POLICY "Equipe insere avaliacoes com acesso a loja"
ON public.customer_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR (store_id IS NOT NULL AND public.user_can_access_store(auth.uid(), store_id))
);
