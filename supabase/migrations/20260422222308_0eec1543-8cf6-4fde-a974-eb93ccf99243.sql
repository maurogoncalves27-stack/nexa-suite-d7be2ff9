-- =========================================================
-- FASE 1 + 2: Fornecedores, Categorias, Cotações e Propostas
-- =========================================================

-- 1) Adiciona role 'supplier' à enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supplier';

-- 2) Catálogo de categorias de fornecimento
CREATE TABLE public.supplier_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorias visíveis a todos autenticados"
  ON public.supplier_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Apenas admin/manager gerencia categorias"
  ON public.supplier_categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_supplier_categories_updated_at
  BEFORE UPDATE ON public.supplier_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Tabela principal de fornecedores
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  cnpj TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  contact_name TEXT,
  payment_terms TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_user_id ON public.suppliers(user_id);
CREATE INDEX idx_suppliers_status ON public.suppliers(status);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- helper: está vinculado a um fornecedor?
CREATE OR REPLACE FUNCTION public.current_supplier_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.suppliers WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_approved_supplier(_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE user_id = _user_id AND status = 'approved'
  );
$$;

-- Admin/manager vê tudo; fornecedor vê só o próprio
CREATE POLICY "Staff vê todos fornecedores"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Fornecedor vê o próprio cadastro"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Auto-cadastro: qualquer usuário autenticado pode criar SEU próprio registro (status pending forçado por trigger)
CREATE POLICY "Usuário cria seu próprio cadastro de fornecedor"
  ON public.suppliers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Fornecedor edita só o próprio (sem mudar status/aprovação)
CREATE POLICY "Fornecedor edita o próprio cadastro"
  ON public.suppliers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff gerencia fornecedores"
  ON public.suppliers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: força fornecedor a entrar como 'pending' no auto-cadastro e impede mudar status sozinho
CREATE OR REPLACE FUNCTION public.protect_supplier_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Staff pode tudo
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.rejection_reason := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Fornecedor não pode alterar campos sensíveis
    NEW.status := OLD.status;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.cnpj := OLD.cnpj; -- CNPJ não muda após cadastro
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_supplier_status_trigger
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.protect_supplier_status();

-- Trigger: quando aprovado, cria role 'supplier' no user_roles
CREATE OR REPLACE FUNCTION public.sync_supplier_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.user_id, 'supplier')
      ON CONFLICT DO NOTHING;
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
    END IF;
  ELSIF NEW.status IN ('rejected','suspended') AND OLD.status = 'approved' THEN
    IF NEW.user_id IS NOT NULL THEN
      DELETE FROM public.user_roles
       WHERE user_id = NEW.user_id AND role = 'supplier';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_supplier_role_trigger
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_role();

-- 4) Categorias aprovadas para cada fornecedor
CREATE TABLE public.supplier_approved_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.supplier_categories(id) ON DELETE CASCADE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  UNIQUE (supplier_id, category_id)
);

CREATE INDEX idx_sac_supplier ON public.supplier_approved_categories(supplier_id);
CREATE INDEX idx_sac_category ON public.supplier_approved_categories(category_id);

ALTER TABLE public.supplier_approved_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia categorias aprovadas"
  ON public.supplier_approved_categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Fornecedor vê suas categorias"
  ON public.supplier_approved_categories FOR SELECT
  TO authenticated
  USING (supplier_id = public.current_supplier_id());

-- 5) Cotações abertas pela empresa
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.supplier_categories(id),
  store_id UUID REFERENCES public.stores(id),
  deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','closed','cancelled','awarded')),
  awarded_supplier_id UUID REFERENCES public.suppliers(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotations_category ON public.quotations(category_id);
CREATE INDEX idx_quotations_deadline ON public.quotations(deadline);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia cotações"
  ON public.quotations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Fornecedor vê cotações abertas das categorias aprovadas
CREATE POLICY "Fornecedor vê cotações abertas das suas categorias"
  ON public.quotations FOR SELECT
  TO authenticated
  USING (
    public.is_approved_supplier(auth.uid())
    AND status = 'open'
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.supplier_approved_categories sac
        WHERE sac.supplier_id = public.current_supplier_id()
          AND sac.category_id = quotations.category_id
      )
    )
  );

CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Itens da cotação
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.inventory_products(id),
  description TEXT NOT NULL,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'UN',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotation_items_quotation ON public.quotation_items(quotation_id);

ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia itens"
  ON public.quotation_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Fornecedor vê itens das cotações que ele acessa"
  ON public.quotation_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.status = 'open'
        AND public.is_approved_supplier(auth.uid())
        AND (
          q.category_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.supplier_approved_categories sac
            WHERE sac.supplier_id = public.current_supplier_id()
              AND sac.category_id = q.category_id
          )
        )
    )
  );

-- 7) Propostas (bids) enviadas pelos fornecedores
CREATE TABLE public.quotation_bids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  delivery_days INTEGER,
  validity_days INTEGER,
  payment_terms TEXT,
  notes TEXT,
  total_amount NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','withdrawn')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quotation_id, supplier_id)
);

CREATE INDEX idx_bids_quotation ON public.quotation_bids(quotation_id);
CREATE INDEX idx_bids_supplier ON public.quotation_bids(supplier_id);

ALTER TABLE public.quotation_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê todas propostas"
  ON public.quotation_bids FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff atualiza propostas"
  ON public.quotation_bids FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Fornecedor vê suas propostas"
  ON public.quotation_bids FOR SELECT
  TO authenticated
  USING (supplier_id = public.current_supplier_id());

CREATE POLICY "Fornecedor cria sua proposta"
  ON public.quotation_bids FOR INSERT
  TO authenticated
  WITH CHECK (
    supplier_id = public.current_supplier_id()
    AND public.is_approved_supplier(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_id AND q.status = 'open'
    )
  );

CREATE POLICY "Fornecedor edita sua proposta enquanto cotação aberta"
  ON public.quotation_bids FOR UPDATE
  TO authenticated
  USING (
    supplier_id = public.current_supplier_id()
    AND EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND q.status = 'open')
  )
  WITH CHECK (supplier_id = public.current_supplier_id());

CREATE POLICY "Fornecedor remove sua proposta enquanto cotação aberta"
  ON public.quotation_bids FOR DELETE
  TO authenticated
  USING (
    supplier_id = public.current_supplier_id()
    AND EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND q.status = 'open')
  );

CREATE TRIGGER update_quotation_bids_updated_at
  BEFORE UPDATE ON public.quotation_bids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8) Linhas de preço da proposta (1 por item da cotação)
CREATE TABLE public.quotation_bid_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_id UUID NOT NULL REFERENCES public.quotation_bids(id) ON DELETE CASCADE,
  quotation_item_id UUID NOT NULL REFERENCES public.quotation_items(id) ON DELETE CASCADE,
  unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
  available_quantity NUMERIC(14,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bid_id, quotation_item_id)
);

CREATE INDEX idx_bid_items_bid ON public.quotation_bid_items(bid_id);

ALTER TABLE public.quotation_bid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê todos itens de proposta"
  ON public.quotation_bid_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Fornecedor vê itens da própria proposta"
  ON public.quotation_bid_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotation_bids b
      WHERE b.id = quotation_bid_items.bid_id
        AND b.supplier_id = public.current_supplier_id()
    )
  );

CREATE POLICY "Fornecedor gerencia itens da própria proposta"
  ON public.quotation_bid_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotation_bids b
      JOIN public.quotations q ON q.id = b.quotation_id
      WHERE b.id = quotation_bid_items.bid_id
        AND b.supplier_id = public.current_supplier_id()
        AND q.status = 'open'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotation_bids b
      JOIN public.quotations q ON q.id = b.quotation_id
      WHERE b.id = quotation_bid_items.bid_id
        AND b.supplier_id = public.current_supplier_id()
        AND q.status = 'open'
    )
  );

CREATE TRIGGER update_quotation_bid_items_updated_at
  BEFORE UPDATE ON public.quotation_bid_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9) Trigger: recalcula total da proposta a partir dos itens
CREATE OR REPLACE FUNCTION public.recalc_bid_total()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bid_id UUID;
  v_total NUMERIC(14,2);
BEGIN
  v_bid_id := COALESCE(NEW.bid_id, OLD.bid_id);
  SELECT COALESCE(SUM(bi.unit_price * qi.quantity), 0)
    INTO v_total
    FROM public.quotation_bid_items bi
    JOIN public.quotation_items qi ON qi.id = bi.quotation_item_id
   WHERE bi.bid_id = v_bid_id;
  UPDATE public.quotation_bids SET total_amount = ROUND(v_total, 2), updated_at = now()
   WHERE id = v_bid_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER recalc_bid_total_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.quotation_bid_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_bid_total();

-- 10) Algumas categorias iniciais
INSERT INTO public.supplier_categories (name, sort_order) VALUES
  ('Hortifruti', 10),
  ('Carnes e Frios', 20),
  ('Bebidas', 30),
  ('Mercearia', 40),
  ('Limpeza', 50),
  ('Embalagens', 60),
  ('Padaria', 70),
  ('Serviços', 80)
ON CONFLICT (name) DO NOTHING;