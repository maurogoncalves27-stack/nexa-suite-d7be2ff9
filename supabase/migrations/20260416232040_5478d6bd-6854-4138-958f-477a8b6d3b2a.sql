-- ============= MÓDULO DE UNIFORMES =============

-- 1) Catálogo de itens de uniforme
CREATE TABLE public.uniform_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'vestuario', -- vestuario, calcado, epi, acessorio
  size_type TEXT NOT NULL DEFAULT 'letra',    -- letra (PP-EG) ou numero (33-46)
  is_durable BOOLEAN NOT NULL DEFAULT TRUE,   -- duráveis devem ser devolvidos no desligamento
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0, -- valor de referência para cobrança de avaria/perda
  replacement_months INTEGER NOT NULL DEFAULT 12, -- periodicidade padrão de troca
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Kit padrão por cargo (quantos de cada item o cargo recebe)
CREATE TABLE public.uniform_kit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position TEXT NOT NULL,
  uniform_item_id UUID NOT NULL REFERENCES public.uniform_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (position, uniform_item_id)
);

-- 3) Estoque por loja, item e tamanho
CREATE TABLE public.uniform_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  uniform_item_id UUID NOT NULL REFERENCES public.uniform_items(id) ON DELETE CASCADE,
  size TEXT NOT NULL, -- PP, P, M, G, GG, EG, ou número
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_alert INTEGER NOT NULL DEFAULT 5, -- alerta quando saldo < min_alert
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, uniform_item_id, size)
);

-- 4) Movimentações de estoque (entradas, saídas, transferências, ajustes)
CREATE TABLE public.uniform_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  uniform_item_id UUID NOT NULL REFERENCES public.uniform_items(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  movement_type TEXT NOT NULL, -- entrada, saida, devolucao, ajuste, perda
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT,
  related_delivery_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Entregas de uniforme ao colaborador
CREATE TABLE public.uniform_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  delivered_on DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_type TEXT NOT NULL DEFAULT 'inicial', -- inicial, troca, reposicao, avaria, perda
  notes TEXT,
  total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  charge_to_employee NUMERIC(10,2) NOT NULL DEFAULT 0, -- valor a descontar em folha
  charge_reason TEXT, -- avaria, perda, nao_devolucao, nenhum
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.uniform_delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.uniform_deliveries(id) ON DELETE CASCADE,
  uniform_item_id UUID NOT NULL REFERENCES public.uniform_items(id),
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  expected_return BOOLEAN NOT NULL DEFAULT TRUE, -- duráveis devem retornar
  returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Devoluções
CREATE TABLE public.uniform_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  returned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  return_reason TEXT NOT NULL DEFAULT 'desligamento', -- desligamento, troca, avaria
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.uniform_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.uniform_returns(id) ON DELETE CASCADE,
  delivery_item_id UUID REFERENCES public.uniform_delivery_items(id),
  uniform_item_id UUID NOT NULL REFERENCES public.uniform_items(id),
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  condition TEXT NOT NULL DEFAULT 'bom', -- bom, danificado, perdido
  back_to_stock BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Triggers ============
-- updated_at em todas as tabelas
CREATE TRIGGER trg_uniform_items_updated BEFORE UPDATE ON public.uniform_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_uniform_kit_items_updated BEFORE UPDATE ON public.uniform_kit_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_uniform_stock_updated BEFORE UPDATE ON public.uniform_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_uniform_deliveries_updated BEFORE UPDATE ON public.uniform_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função: ajustar saldo de estoque ao registrar movimentação
CREATE OR REPLACE FUNCTION public.apply_uniform_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta INTEGER;
  current_qty INTEGER;
BEGIN
  IF NEW.movement_type IN ('entrada','devolucao') THEN
    delta := NEW.quantity;
  ELSIF NEW.movement_type IN ('saida','perda') THEN
    delta := -NEW.quantity;
  ELSE -- ajuste: NEW.quantity pode ser positivo (já tratado como ajuste +)
    delta := NEW.quantity;
  END IF;

  INSERT INTO public.uniform_stock (store_id, uniform_item_id, size, quantity)
    VALUES (NEW.store_id, NEW.uniform_item_id, NEW.size, GREATEST(delta,0))
  ON CONFLICT (store_id, uniform_item_id, size)
    DO UPDATE SET quantity = public.uniform_stock.quantity + delta,
                  updated_at = now();

  SELECT quantity INTO current_qty FROM public.uniform_stock
   WHERE store_id = NEW.store_id AND uniform_item_id = NEW.uniform_item_id AND size = NEW.size;
  IF current_qty < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente para % (tam %): saldo ficaria %.', NEW.uniform_item_id, NEW.size, current_qty;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.uniform_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_uniform_stock_movement();

-- Função: verificar pendências de devolução de um colaborador
CREATE OR REPLACE FUNCTION public.employee_uniform_pending(_employee_id UUID)
RETURNS TABLE(
  uniform_item_id UUID,
  item_name TEXT,
  size TEXT,
  delivered INTEGER,
  returned INTEGER,
  pending INTEGER
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT di.uniform_item_id,
         ui.name,
         di.size,
         SUM(di.quantity)::INTEGER AS delivered,
         SUM(di.returned_quantity)::INTEGER AS returned,
         (SUM(di.quantity) - SUM(di.returned_quantity))::INTEGER AS pending
    FROM public.uniform_delivery_items di
    JOIN public.uniform_deliveries d ON d.id = di.delivery_id
    JOIN public.uniform_items ui ON ui.id = di.uniform_item_id
   WHERE d.employee_id = _employee_id
     AND di.expected_return = TRUE
   GROUP BY di.uniform_item_id, ui.name, di.size
  HAVING (SUM(di.quantity) - SUM(di.returned_quantity)) > 0;
$$;

-- ============ RLS ============
ALTER TABLE public.uniform_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_return_items ENABLE ROW LEVEL SECURITY;

-- Catálogo e kits: todos autenticados leem; apenas admin gerencia
CREATE POLICY "View uniform items" ON public.uniform_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage uniform items" ON public.uniform_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "View kit items" ON public.uniform_kit_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage kit items" ON public.uniform_kit_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Estoque, movimentações e entregas: admin total; manager nas suas lojas
CREATE POLICY "View uniform stock" ON public.uniform_stock FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))));
CREATE POLICY "Manage uniform stock" ON public.uniform_stock FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))))
  WITH CHECK (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))));

CREATE POLICY "View stock movements" ON public.uniform_stock_movements FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))));
CREATE POLICY "Manage stock movements" ON public.uniform_stock_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))))
  WITH CHECK (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))));

CREATE POLICY "View deliveries" ON public.uniform_deliveries FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid())))
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = uniform_deliveries.employee_id AND e.user_id = auth.uid())
  );
CREATE POLICY "Manage deliveries" ON public.uniform_deliveries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))))
  WITH CHECK (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))));

CREATE POLICY "View delivery items" ON public.uniform_delivery_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM uniform_deliveries d WHERE d.id = uniform_delivery_items.delivery_id
      AND (
        has_role(auth.uid(),'admin')
        OR (has_role(auth.uid(),'manager') AND d.store_id IN (SELECT user_accessible_stores(auth.uid())))
        OR EXISTS (SELECT 1 FROM employees e WHERE e.id = d.employee_id AND e.user_id = auth.uid())
      )
  ));
CREATE POLICY "Manage delivery items" ON public.uniform_delivery_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM uniform_deliveries d WHERE d.id = uniform_delivery_items.delivery_id
    AND (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND d.store_id IN (SELECT user_accessible_stores(auth.uid()))))))
  WITH CHECK (EXISTS (SELECT 1 FROM uniform_deliveries d WHERE d.id = uniform_delivery_items.delivery_id
    AND (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND d.store_id IN (SELECT user_accessible_stores(auth.uid()))))));

CREATE POLICY "View returns" ON public.uniform_returns FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid())))
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = uniform_returns.employee_id AND e.user_id = auth.uid())
  );
CREATE POLICY "Manage returns" ON public.uniform_returns FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))))
  WITH CHECK (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND store_id IN (SELECT user_accessible_stores(auth.uid()))));

CREATE POLICY "View return items" ON public.uniform_return_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM uniform_returns r WHERE r.id = uniform_return_items.return_id
    AND (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND r.store_id IN (SELECT user_accessible_stores(auth.uid())))
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = r.employee_id AND e.user_id = auth.uid()))));
CREATE POLICY "Manage return items" ON public.uniform_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM uniform_returns r WHERE r.id = uniform_return_items.return_id
    AND (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND r.store_id IN (SELECT user_accessible_stores(auth.uid()))))))
  WITH CHECK (EXISTS (SELECT 1 FROM uniform_returns r WHERE r.id = uniform_return_items.return_id
    AND (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'manager') AND r.store_id IN (SELECT user_accessible_stores(auth.uid()))))));

-- Índices úteis
CREATE INDEX idx_uniform_stock_store ON public.uniform_stock(store_id);
CREATE INDEX idx_uniform_deliveries_employee ON public.uniform_deliveries(employee_id);
CREATE INDEX idx_uniform_deliveries_store ON public.uniform_deliveries(store_id);
CREATE INDEX idx_uniform_delivery_items_delivery ON public.uniform_delivery_items(delivery_id);
CREATE INDEX idx_uniform_returns_employee ON public.uniform_returns(employee_id);
CREATE INDEX idx_uniform_stock_movements_store ON public.uniform_stock_movements(store_id);