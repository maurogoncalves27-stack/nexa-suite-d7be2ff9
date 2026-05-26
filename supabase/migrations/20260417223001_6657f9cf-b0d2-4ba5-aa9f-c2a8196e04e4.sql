-- Função helper: pega a loja do colaborador via tabela employees
CREATE OR REPLACE FUNCTION public.nutri_get_user_store_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(allocated_store_id, store_id)
  FROM public.employees
  WHERE user_id = _user_id
  LIMIT 1;
$$;

-- ============ ITEMS ============
CREATE TABLE public.nutri_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category integer NOT NULL DEFAULT 1 CHECK (category >= 1 AND category <= 7),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_items_select" ON public.nutri_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "nutri_items_insert" ON public.nutri_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "nutri_items_update" ON public.nutri_items FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_items_delete" ON public.nutri_items FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

-- ============ DAY RECORDS ============
CREATE TABLE public.nutri_day_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.nutri_items(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  date date NOT NULL,
  sim_nao boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  UNIQUE (user_id, item_id, date)
);
ALTER TABLE public.nutri_day_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_dr_select" ON public.nutri_day_records FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_dr_insert" ON public.nutri_day_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_dr_update" ON public.nutri_day_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_dr_delete" ON public.nutri_day_records FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_nutri_dr_date ON public.nutri_day_records (date DESC);
CREATE INDEX idx_nutri_dr_store ON public.nutri_day_records (store_id);

-- ============ EQUIPMENT ============
CREATE TABLE public.nutri_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_eq_select" ON public.nutri_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "nutri_eq_insert" ON public.nutri_equipment FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_eq_update" ON public.nutri_equipment FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_eq_delete" ON public.nutri_equipment FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ TEMPERATURE READINGS ============
CREATE TABLE public.nutri_temperature_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.nutri_equipment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  temperature numeric(5,1) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_temperature_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_tr_select" ON public.nutri_temperature_readings FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_tr_insert" ON public.nutri_temperature_readings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_tr_update" ON public.nutri_temperature_readings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_tr_delete" ON public.nutri_temperature_readings FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_nutri_tr_date ON public.nutri_temperature_readings (date DESC);

-- ============ MAINTENANCE RECORDS ============
CREATE TABLE public.nutri_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  equipment_type text NOT NULL,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('preventiva', 'corretiva')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_mr_select" ON public.nutri_maintenance_records FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_mr_insert" ON public.nutri_maintenance_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_mr_update" ON public.nutri_maintenance_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_mr_delete" ON public.nutri_maintenance_records FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- ============ MERCHANDISE RECEIPTS ============
CREATE TABLE public.nutri_merchandise_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  received_at timestamptz NOT NULL DEFAULT now(),
  batch text NOT NULL,
  product_name text NOT NULL,
  supplier text NOT NULL,
  temperature numeric NOT NULL,
  storage_type text NOT NULL CHECK (storage_type IN ('refrigerado', 'congelado')),
  has_irregularity boolean NOT NULL DEFAULT false,
  is_return boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_merchandise_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_mer_select" ON public.nutri_merchandise_receipts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_mer_insert" ON public.nutri_merchandise_receipts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_mer_update" ON public.nutri_merchandise_receipts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_mer_delete" ON public.nutri_merchandise_receipts FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_nutri_mer_date ON public.nutri_merchandise_receipts (date DESC);

-- ============ OIL QUALITY ============
CREATE TABLE public.nutri_oil_quality_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  quality text NOT NULL CHECK (quality IN ('bom', 'ruim')),
  changed boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_oil_quality_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_oil_select" ON public.nutri_oil_quality_records FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_oil_insert" ON public.nutri_oil_quality_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_oil_update" ON public.nutri_oil_quality_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_oil_delete" ON public.nutri_oil_quality_records FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- ============ PEST OCCURRENCES ============
CREATE TABLE public.nutri_pest_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  pest_type text NOT NULL,
  location text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_pest_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_po_select" ON public.nutri_pest_occurrences FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_po_insert" ON public.nutri_pest_occurrences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_po_update" ON public.nutri_pest_occurrences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_po_delete" ON public.nutri_pest_occurrences FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_nutri_po_date ON public.nutri_pest_occurrences (date DESC);

-- ============ PEST CONTROL RECORDS ============
CREATE TABLE public.nutri_pest_control_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  service_date date NOT NULL,
  company_name text NOT NULL,
  certificate_url text,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_pest_control_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_pcr_select" ON public.nutri_pest_control_records FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_pcr_insert" ON public.nutri_pest_control_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_pcr_update" ON public.nutri_pest_control_records FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_pcr_delete" ON public.nutri_pest_control_records FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE TRIGGER trg_nutri_pcr_updated BEFORE UPDATE ON public.nutri_pest_control_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WATER TANK CLEANINGS ============
CREATE TABLE public.nutri_water_tank_cleanings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  cleaning_date date NOT NULL,
  responsible text NOT NULL DEFAULT '',
  report_url text,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_water_tank_cleanings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_wt_select" ON public.nutri_water_tank_cleanings FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_wt_insert" ON public.nutri_water_tank_cleanings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_wt_update" ON public.nutri_water_tank_cleanings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_wt_delete" ON public.nutri_water_tank_cleanings FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE TRIGGER trg_nutri_wt_updated BEFORE UPDATE ON public.nutri_water_tank_cleanings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ VISIT REPORTS ============
CREATE TABLE public.nutri_visit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  visitor_name text NOT NULL,
  general_notes text NOT NULL DEFAULT '',
  signature_url text,
  store_responsible_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_visit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_vr_select" ON public.nutri_visit_reports FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid()));
CREATE POLICY "nutri_vr_insert" ON public.nutri_visit_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR store_id = nutri_get_user_store_id(auth.uid())));
CREATE POLICY "nutri_vr_update" ON public.nutri_visit_reports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_vr_delete" ON public.nutri_visit_reports FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_nutri_vr_date ON public.nutri_visit_reports (visit_date DESC);

-- ============ VISIT CHECKLIST ITEMS ============
CREATE TABLE public.nutri_visit_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_visit_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_vci_select" ON public.nutri_visit_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "nutri_vci_insert" ON public.nutri_visit_checklist_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_vci_update" ON public.nutri_visit_checklist_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "nutri_vci_delete" ON public.nutri_visit_checklist_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ VISIT CHECKLIST RESPONSES ============
CREATE TABLE public.nutri_visit_checklist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_report_id uuid NOT NULL REFERENCES public.nutri_visit_reports(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.nutri_visit_checklist_items(id) ON DELETE CASCADE,
  is_conform boolean NOT NULL DEFAULT true,
  observation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutri_visit_checklist_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutri_vcr_select" ON public.nutri_visit_checklist_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "nutri_vcr_insert" ON public.nutri_visit_checklist_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.nutri_visit_reports WHERE id = visit_report_id));
CREATE POLICY "nutri_vcr_update" ON public.nutri_visit_checklist_responses FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.nutri_visit_reports WHERE id = visit_report_id));
CREATE POLICY "nutri_vcr_delete" ON public.nutri_visit_checklist_responses FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.nutri_visit_reports WHERE id = visit_report_id));

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('nutri-pest-certificates', 'nutri-pest-certificates', true),
  ('nutri-water-reports', 'nutri-water-reports', true),
  ('nutri-visit-signatures', 'nutri-visit-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (acesso público para leitura, autenticados para upload/edit)
CREATE POLICY "nutri_buckets_select" ON storage.objects FOR SELECT
  USING (bucket_id IN ('nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'));
CREATE POLICY "nutri_buckets_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'));
CREATE POLICY "nutri_buckets_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'));
CREATE POLICY "nutri_buckets_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('nutri-pest-certificates','nutri-water-reports','nutri-visit-signatures'));