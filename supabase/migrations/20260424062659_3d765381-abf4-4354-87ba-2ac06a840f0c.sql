-- =====================================================
-- INVENTÁRIO FÍSICO (contagem por loja)
-- =====================================================

CREATE TABLE public.inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'open', -- open | submitted | approved | cancelled
  notes TEXT,
  category_filter TEXT, -- opcional: limitar a uma categoria
  total_items INTEGER NOT NULL DEFAULT 0,
  divergent_items INTEGER NOT NULL DEFAULT 0,
  total_difference_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  opened_by UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by UUID,
  submitted_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_counts_store ON public.inventory_counts(store_id);
CREATE INDEX idx_inventory_counts_status ON public.inventory_counts(status);

CREATE TABLE public.inventory_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  system_quantity NUMERIC(14,4) NOT NULL DEFAULT 0, -- foto do saldo na abertura
  counted_quantity NUMERIC(14,4),                   -- digitado pelo colaborador
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  difference NUMERIC(14,4) GENERATED ALWAYS AS (COALESCE(counted_quantity,0) - system_quantity) STORED,
  difference_value NUMERIC(14,4) GENERATED ALWAYS AS ((COALESCE(counted_quantity,0) - system_quantity) * unit_cost) STORED,
  notes TEXT,
  counted_by UUID,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

CREATE INDEX idx_inventory_count_items_count ON public.inventory_count_items(count_id);

-- Trigger updated_at
CREATE TRIGGER trg_inventory_counts_updated_at
  BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_inventory_count_items_updated_at
  BEFORE UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;

-- Counts: ver/abrir quem tem acesso à loja; só staff aprova
CREATE POLICY "View counts of accessible stores"
  ON public.inventory_counts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.user_can_access_store(auth.uid(), store_id)
  );

CREATE POLICY "Open counts on accessible stores"
  ON public.inventory_counts FOR INSERT
  WITH CHECK (
    auth.uid() = opened_by AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.user_can_access_store(auth.uid(), store_id)
    )
  );

-- Update: enquanto aberto, qualquer um da loja pode atualizar (ex: notas);
-- após submetido, só staff
CREATE POLICY "Update open counts (store users) or staff anytime"
  ON public.inventory_counts FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR (status = 'open' AND public.user_can_access_store(auth.uid(), store_id))
    OR (status = 'submitted' AND public.user_can_access_store(auth.uid(), store_id) AND submitted_by = auth.uid())
  );

CREATE POLICY "Delete counts staff only"
  ON public.inventory_counts FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Items: ver junto com a contagem
CREATE POLICY "View count items"
  ON public.inventory_count_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts c
      WHERE c.id = count_id AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.user_can_access_store(auth.uid(), c.store_id)
      )
    )
  );

CREATE POLICY "Insert items on open counts"
  ON public.inventory_count_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_counts c
      WHERE c.id = count_id AND c.status = 'open' AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.user_can_access_store(auth.uid(), c.store_id)
      )
    )
  );

CREATE POLICY "Update items: open by store / staff anytime"
  ON public.inventory_count_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts c
      WHERE c.id = count_id AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR (c.status = 'open' AND public.user_can_access_store(auth.uid(), c.store_id))
      )
    )
  );

CREATE POLICY "Delete items: open by store / staff anytime"
  ON public.inventory_count_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts c
      WHERE c.id = count_id AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR (c.status = 'open' AND public.user_can_access_store(auth.uid(), c.store_id))
      )
    )
  );

-- =====================================================
-- FUNÇÕES
-- =====================================================

-- Abrir uma contagem: cria header e popula items com saldo atual
CREATE OR REPLACE FUNCTION public.open_inventory_count(
  _store_id UUID,
  _category TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count_id UUID;
  v_inserted INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager') OR user_can_access_store(v_uid, _store_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;

  -- Bloqueia abrir duas contagens abertas simultâneas para a mesma loja
  IF EXISTS (
    SELECT 1 FROM inventory_counts
    WHERE store_id = _store_id AND status IN ('open','submitted')
  ) THEN
    RAISE EXCEPTION 'Já existe uma contagem em andamento para esta loja';
  END IF;

  INSERT INTO inventory_counts (store_id, category_filter, notes, opened_by)
  VALUES (_store_id, _category, _notes, v_uid)
  RETURNING id INTO v_count_id;

  INSERT INTO inventory_count_items (count_id, product_id, system_quantity, unit_cost)
  SELECT v_count_id,
         s.product_id,
         s.quantity,
         COALESCE(p.average_cost, 0)
    FROM inventory_stock s
    JOIN inventory_products p ON p.id = s.product_id
   WHERE s.store_id = _store_id
     AND (_category IS NULL OR p.category = _category);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE inventory_counts SET total_items = v_inserted WHERE id = v_count_id;

  RETURN v_count_id;
END;
$$;

-- Enviar contagem para revisão
CREATE OR REPLACE FUNCTION public.submit_inventory_count(_count_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count RECORD;
  v_div INT;
  v_val NUMERIC(14,4);
BEGIN
  SELECT * INTO v_count FROM inventory_counts WHERE id = _count_id;
  IF v_count IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada'; END IF;
  IF v_count.status <> 'open' THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager') OR user_can_access_store(v_uid, v_count.store_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;

  SELECT COUNT(*) FILTER (WHERE difference <> 0),
         COALESCE(SUM(difference_value), 0)
    INTO v_div, v_val
    FROM inventory_count_items
   WHERE count_id = _count_id;

  UPDATE inventory_counts
     SET status = 'submitted',
         submitted_by = v_uid,
         submitted_at = now(),
         divergent_items = v_div,
         total_difference_value = v_val
   WHERE id = _count_id;
END;
$$;

-- Aprovar contagem: gera movimentações de ajuste para cada diferença
CREATE OR REPLACE FUNCTION public.approve_inventory_count(_count_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count RECORD;
  v_item RECORD;
  v_movs INT := 0;
BEGIN
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Apenas gestores podem aprovar';
  END IF;

  SELECT * INTO v_count FROM inventory_counts WHERE id = _count_id;
  IF v_count IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada'; END IF;
  IF v_count.status <> 'submitted' THEN
    RAISE EXCEPTION 'Contagem precisa estar enviada para aprovação';
  END IF;

  FOR v_item IN
    SELECT * FROM inventory_count_items
     WHERE count_id = _count_id AND counted_quantity IS NOT NULL AND difference <> 0
  LOOP
    INSERT INTO inventory_stock_movements
      (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
    VALUES
      (v_count.store_id, v_item.product_id, 'ajuste',
       v_item.difference, v_item.unit_cost,
       'Ajuste de inventário #' || substr(_count_id::text,1,8), v_uid);
    v_movs := v_movs + 1;
  END LOOP;

  UPDATE inventory_counts
     SET status = 'approved',
         approved_by = v_uid,
         approved_at = now()
   WHERE id = _count_id;

  RETURN jsonb_build_object('approved', true, 'adjustments', v_movs);
END;
$$;

-- Reabrir contagem (gestor) caso precise corrigir
CREATE OR REPLACE FUNCTION public.reopen_inventory_count(_count_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count RECORD;
BEGIN
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Apenas gestores podem reabrir';
  END IF;
  SELECT * INTO v_count FROM inventory_counts WHERE id = _count_id;
  IF v_count IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada'; END IF;
  IF v_count.status <> 'submitted' THEN
    RAISE EXCEPTION 'Apenas contagens enviadas podem ser reabertas';
  END IF;
  UPDATE inventory_counts
     SET status = 'open',
         submitted_by = NULL,
         submitted_at = NULL
   WHERE id = _count_id;
END;
$$;

-- Cancelar
CREATE OR REPLACE FUNCTION public.cancel_inventory_count(_count_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'manager')) THEN
    RAISE EXCEPTION 'Apenas gestores podem cancelar';
  END IF;
  UPDATE inventory_counts SET status = 'cancelled'
   WHERE id = _count_id AND status IN ('open','submitted');
END;
$$;