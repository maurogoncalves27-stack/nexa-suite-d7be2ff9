-- Helper: política de SELECT para partner (idempotente)
-- Usaremos comandos diretos para clareza. Ignore-se erros de já-existe.

-- monthly_revenue
DROP POLICY IF EXISTS "Partners can view monthly_revenue" ON public.monthly_revenue;
CREATE POLICY "Partners can view monthly_revenue" ON public.monthly_revenue
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- bank_accounts
DROP POLICY IF EXISTS "Partners view bank_accounts" ON public.bank_accounts;
CREATE POLICY "Partners view bank_accounts" ON public.bank_accounts
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- bank_statements
DROP POLICY IF EXISTS "Partners view bank_statements" ON public.bank_statements;
CREATE POLICY "Partners view bank_statements" ON public.bank_statements
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- bank_transactions
DROP POLICY IF EXISTS "Partners view bank_transactions" ON public.bank_transactions;
CREATE POLICY "Partners view bank_transactions" ON public.bank_transactions
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- bank_transfers
DROP POLICY IF EXISTS "Partners view bank_transfers" ON public.bank_transfers;
CREATE POLICY "Partners view bank_transfers" ON public.bank_transfers
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- pdv_orders / order_items / payments / channels / fiscal_invoices
DROP POLICY IF EXISTS "Partners view pdv_orders" ON public.pdv_orders;
CREATE POLICY "Partners view pdv_orders" ON public.pdv_orders
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view pdv_order_items" ON public.pdv_order_items;
CREATE POLICY "Partners view pdv_order_items" ON public.pdv_order_items
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view pdv_payments" ON public.pdv_payments;
CREATE POLICY "Partners view pdv_payments" ON public.pdv_payments
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view pdv_channels" ON public.pdv_channels;
CREATE POLICY "Partners view pdv_channels" ON public.pdv_channels
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view pdv_fiscal_invoices" ON public.pdv_fiscal_invoices;
CREATE POLICY "Partners view pdv_fiscal_invoices" ON public.pdv_fiscal_invoices
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- positions / position_bonuses
DROP POLICY IF EXISTS "Partners view positions" ON public.positions;
CREATE POLICY "Partners view positions" ON public.positions
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view position_bonuses" ON public.position_bonuses;
CREATE POLICY "Partners view position_bonuses" ON public.position_bonuses
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

-- catálogo / cardápio
DROP POLICY IF EXISTS "Partners view inventory_products" ON public.inventory_products;
CREATE POLICY "Partners view inventory_products" ON public.inventory_products
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view menu_items" ON public.menu_items;
CREATE POLICY "Partners view menu_items" ON public.menu_items
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));

DROP POLICY IF EXISTS "Partners view recipes" ON public.recipes;
CREATE POLICY "Partners view recipes" ON public.recipes
  FOR SELECT TO authenticated USING (public.is_partner(auth.uid()));