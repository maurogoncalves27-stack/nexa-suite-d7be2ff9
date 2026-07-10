
-- 1. Prefixos NCM elegíveis
CREATE TABLE public.asset_capex_ncm_prefixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_capex_ncm_prefixes TO authenticated;
GRANT ALL ON public.asset_capex_ncm_prefixes TO service_role;
ALTER TABLE public.asset_capex_ncm_prefixes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage capex ncm" ON public.asset_capex_ncm_prefixes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

INSERT INTO public.asset_capex_ncm_prefixes(prefix, description) VALUES
  ('84', 'Máquinas e aparelhos mecânicos'),
  ('85', 'Máquinas e equipamentos elétricos/eletrônicos'),
  ('90', 'Instrumentos e aparelhos de precisão'),
  ('9403', 'Móveis');

-- 2. Configurações
CREATE TABLE public.asset_suggestion_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  min_equipment_value numeric NOT NULL DEFAULT 500,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_suggestion_settings TO authenticated;
GRANT ALL ON public.asset_suggestion_settings TO service_role;
ALTER TABLE public.asset_suggestion_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage asset settings" ON public.asset_suggestion_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
INSERT INTO public.asset_suggestion_settings(id) VALUES (true);

-- 3. is_capex em finance_categories
ALTER TABLE public.finance_categories ADD COLUMN IF NOT EXISTS is_capex boolean NOT NULL DEFAULT false;

-- 4. Tabela de sugestões
CREATE TABLE public.asset_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('nfe','inventory_invoice','payable')),
  source_id uuid NOT NULL,
  source_item_id uuid,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  supplier_name text,
  description text NOT NULL,
  ncm text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  suggested_category text NOT NULL DEFAULT 'equipamento' CHECK (suggested_category IN ('mobiliario','equipamento','utensilio')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','ignored')),
  asset_id uuid REFERENCES public.asset_inventory(id) ON DELETE SET NULL,
  decided_by uuid,
  decided_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_item_id)
);
CREATE INDEX idx_asset_suggestions_status ON public.asset_suggestions(status);
CREATE INDEX idx_asset_suggestions_store ON public.asset_suggestions(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_suggestions TO authenticated;
GRANT ALL ON public.asset_suggestions TO service_role;
ALTER TABLE public.asset_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view suggestions" ON public.asset_suggestions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Staff insert suggestions" ON public.asset_suggestions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Staff update suggestions" ON public.asset_suggestions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Staff delete suggestions" ON public.asset_suggestions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_asset_suggestions_updated_at BEFORE UPDATE ON public.asset_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. source_suggestion_id em asset_inventory
ALTER TABLE public.asset_inventory ADD COLUMN IF NOT EXISTS source_suggestion_id uuid REFERENCES public.asset_suggestions(id) ON DELETE SET NULL;

-- 6. Função helper: decide se NCM é capex
CREATE OR REPLACE FUNCTION public.ncm_is_capex(_ncm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.asset_capex_ncm_prefixes
    WHERE is_active = true AND _ncm IS NOT NULL AND _ncm LIKE prefix || '%'
  );
$$;

-- 7. Trigger para dfe_inbound_items
CREATE OR REPLACE FUNCTION public.trg_asset_suggest_from_dfe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note record;
  v_min numeric;
  v_cat text;
BEGIN
  IF NOT public.ncm_is_capex(NEW.ncm) THEN RETURN NEW; END IF;
  SELECT supplier_name, COALESCE(target_store_id, store_id) AS sid INTO v_note
    FROM public.dfe_inbound_notes WHERE id = NEW.note_id;
  SELECT min_equipment_value INTO v_min FROM public.asset_suggestion_settings WHERE id = true;
  v_cat := CASE WHEN NEW.unit_value >= COALESCE(v_min, 500) THEN 'equipamento' ELSE 'utensilio' END;
  INSERT INTO public.asset_suggestions(source_type, source_id, source_item_id, store_id, supplier_name, description, ncm, quantity, unit_value, total_value, suggested_category)
  VALUES ('nfe', NEW.note_id, NEW.id, v_note.sid, v_note.supplier_name, NEW.description, NEW.ncm, NEW.quantity, NEW.unit_value, NEW.total_value, v_cat)
  ON CONFLICT (source_type, source_item_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER dfe_items_asset_suggest AFTER INSERT ON public.dfe_inbound_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_asset_suggest_from_dfe();

-- 8. Trigger para inventory_invoice_items
CREATE OR REPLACE FUNCTION public.trg_asset_suggest_from_inv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv record;
  v_min numeric;
  v_cat text;
BEGIN
  IF NOT public.ncm_is_capex(NEW.original_ncm) THEN RETURN NEW; END IF;
  SELECT supplier_name, store_id INTO v_inv FROM public.inventory_invoices WHERE id = NEW.invoice_id;
  SELECT min_equipment_value INTO v_min FROM public.asset_suggestion_settings WHERE id = true;
  v_cat := CASE WHEN NEW.unit_value >= COALESCE(v_min, 500) THEN 'equipamento' ELSE 'utensilio' END;
  INSERT INTO public.asset_suggestions(source_type, source_id, source_item_id, store_id, supplier_name, description, ncm, quantity, unit_value, total_value, suggested_category)
  VALUES ('inventory_invoice', NEW.invoice_id, NEW.id, v_inv.store_id, v_inv.supplier_name, NEW.original_description, NEW.original_ncm, NEW.quantity, NEW.unit_value, NEW.total_value, v_cat)
  ON CONFLICT (source_type, source_item_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER inv_items_asset_suggest AFTER INSERT ON public.inventory_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_asset_suggest_from_inv();

-- 9. Trigger para accounts_payable (categoria capex)
CREATE OR REPLACE FUNCTION public.trg_asset_suggest_from_payable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_capex boolean;
  v_min numeric;
  v_cat text;
BEGIN
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;
  SELECT is_capex INTO v_capex FROM public.finance_categories WHERE id = NEW.category_id;
  IF NOT COALESCE(v_capex, false) THEN RETURN NEW; END IF;
  SELECT min_equipment_value INTO v_min FROM public.asset_suggestion_settings WHERE id = true;
  v_cat := CASE WHEN NEW.amount >= COALESCE(v_min, 500) THEN 'equipamento' ELSE 'utensilio' END;
  INSERT INTO public.asset_suggestions(source_type, source_id, source_item_id, store_id, supplier_name, description, quantity, unit_value, total_value, suggested_category)
  VALUES ('payable', NEW.id, NEW.id, NEW.store_id, NEW.supplier_name, COALESCE(NEW.description, NEW.supplier_name, 'Lançamento manual'), 1, NEW.amount, NEW.amount, v_cat)
  ON CONFLICT (source_type, source_item_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER payable_asset_suggest AFTER INSERT ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.trg_asset_suggest_from_payable();
