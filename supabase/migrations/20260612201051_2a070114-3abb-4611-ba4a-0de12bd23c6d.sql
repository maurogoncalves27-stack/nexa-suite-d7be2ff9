
-- 1) menu_item_stores: remove ALL-command policy, restrict writes to admins/managers
DROP POLICY IF EXISTS "menu_item_stores_manage_authenticated" ON public.menu_item_stores;

CREATE POLICY "menu_item_stores_insert_admin_manager"
  ON public.menu_item_stores FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "menu_item_stores_update_admin_manager"
  ON public.menu_item_stores FOR UPDATE TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "menu_item_stores_delete_admin_manager"
  ON public.menu_item_stores FOR DELETE TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- 2) store_fiscal_credentials: terminal store-login accounts only need to READ
--    their own CSC tokens to issue NFC-e. Writes remain admin/super-user only.
DROP POLICY IF EXISTS "Store login manages own fiscal credentials" ON public.store_fiscal_credentials;

CREATE POLICY "Store login reads own fiscal credentials"
  ON public.store_fiscal_credentials FOR SELECT TO authenticated
  USING (store_id = public.store_login_store_id(auth.uid()));
