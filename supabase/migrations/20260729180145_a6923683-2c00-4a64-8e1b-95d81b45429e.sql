GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_items TO authenticated;
GRANT ALL ON public.uniform_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_stock TO authenticated;
GRANT ALL ON public.uniform_stock TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_stock_movements TO authenticated;
GRANT ALL ON public.uniform_stock_movements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_deliveries TO authenticated;
GRANT ALL ON public.uniform_deliveries TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_delivery_items TO authenticated;
GRANT ALL ON public.uniform_delivery_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_returns TO authenticated;
GRANT ALL ON public.uniform_returns TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_return_items TO authenticated;
GRANT ALL ON public.uniform_return_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uniform_kit_items TO authenticated;
GRANT ALL ON public.uniform_kit_items TO service_role;

GRANT SELECT ON public.uniform_pending_returns TO authenticated;
GRANT ALL ON public.uniform_pending_returns TO service_role;

DROP POLICY IF EXISTS "Manage uniform stock" ON public.uniform_stock;
CREATE POLICY "Manage uniform stock"
ON public.uniform_stock
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);

DROP POLICY IF EXISTS "View uniform stock" ON public.uniform_stock;
CREATE POLICY "View uniform stock"
ON public.uniform_stock
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Manage stock movements" ON public.uniform_stock_movements;
CREATE POLICY "Manage stock movements"
ON public.uniform_stock_movements
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);

DROP POLICY IF EXISTS "View stock movements" ON public.uniform_stock_movements;
CREATE POLICY "View stock movements"
ON public.uniform_stock_movements
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Manage deliveries" ON public.uniform_deliveries;
CREATE POLICY "Manage deliveries"
ON public.uniform_deliveries
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);

DROP POLICY IF EXISTS "View deliveries" ON public.uniform_deliveries;
CREATE POLICY "View deliveries"
ON public.uniform_deliveries
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = uniform_deliveries.employee_id
      AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Manage delivery items" ON public.uniform_delivery_items;
CREATE POLICY "Manage delivery items"
ON public.uniform_delivery_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.uniform_deliveries d
    WHERE d.id = uniform_delivery_items.delivery_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
        OR public.is_super_user(auth.uid())
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND d.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.uniform_deliveries d
    WHERE d.id = uniform_delivery_items.delivery_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
        OR public.is_super_user(auth.uid())
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND d.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
      )
  )
);

DROP POLICY IF EXISTS "View delivery items" ON public.uniform_delivery_items;
CREATE POLICY "View delivery items"
ON public.uniform_delivery_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.uniform_deliveries d
    WHERE d.id = uniform_delivery_items.delivery_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
        OR public.is_super_user(auth.uid())
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND d.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
        OR EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = d.employee_id
            AND e.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Manage returns" ON public.uniform_returns;
CREATE POLICY "Manage returns"
ON public.uniform_returns
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
);

DROP POLICY IF EXISTS "View returns" ON public.uniform_returns;
CREATE POLICY "View returns"
ON public.uniform_returns
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.is_super_user(auth.uid())
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND store_id IN (SELECT public.user_accessible_stores(auth.uid()))
  )
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = uniform_returns.employee_id
      AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Manage return items" ON public.uniform_return_items;
CREATE POLICY "Manage return items"
ON public.uniform_return_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.uniform_returns r
    WHERE r.id = uniform_return_items.return_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
        OR public.is_super_user(auth.uid())
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND r.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.uniform_returns r
    WHERE r.id = uniform_return_items.return_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
        OR public.is_super_user(auth.uid())
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND r.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
      )
  )
);

DROP POLICY IF EXISTS "View return items" ON public.uniform_return_items;
CREATE POLICY "View return items"
ON public.uniform_return_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.uniform_returns r
    WHERE r.id = uniform_return_items.return_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'hr'::public.app_role)
        OR public.is_super_user(auth.uid())
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND r.store_id IN (SELECT public.user_accessible_stores(auth.uid()))
        )
        OR EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = r.employee_id
            AND e.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Admin manage kit items" ON public.uniform_kit_items;
CREATE POLICY "Manage kit items"
ON public.uniform_kit_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.is_super_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.is_super_user(auth.uid())
);