-- 1. Empresas terceirizadas
CREATE TABLE IF NOT EXISTS public.outsourced_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT,
  trade_name TEXT,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  service_area TEXT,
  contact_name TEXT,
  contact_role TEXT,
  contact_phone TEXT,
  contract_start DATE,
  contract_end DATE,
  monthly_value NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_outsourced_companies_updated_at
  BEFORE UPDATE ON public.outsourced_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.outsourced_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager veem empresas terceirizadas"
  ON public.outsourced_companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/manager gerenciam empresas terceirizadas"
  ON public.outsourced_companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 2. Profissionais terceirizados
CREATE TABLE IF NOT EXISTS public.outsourced_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  cpf TEXT,
  rg TEXT,
  phone TEXT,
  email TEXT,
  role_title TEXT,
  specialty TEXT,
  professional_license TEXT,
  company_id UUID REFERENCES public.outsourced_companies(id) ON DELETE SET NULL,
  user_id UUID,
  is_nutritionist BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_outsourced_professionals_updated_at
  BEFORE UPDATE ON public.outsourced_professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.outsourced_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager veem terceirizados"
  ON public.outsourced_professionals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Terceirizado vê seu próprio cadastro"
  ON public.outsourced_professionals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin/manager gerenciam terceirizados"
  ON public.outsourced_professionals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 3. Vínculo profissional <-> lojas
CREATE TABLE IF NOT EXISTS public.outsourced_professional_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.outsourced_professionals(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (professional_id, store_id)
);

ALTER TABLE public.outsourced_professional_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager gerenciam vínculos terceirizado-loja"
  ON public.outsourced_professional_stores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Terceirizado vê suas lojas vinculadas"
  ON public.outsourced_professional_stores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outsourced_professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );

-- 4. Documentos (contratos)
CREATE TABLE IF NOT EXISTS public.outsourced_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.outsourced_companies(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.outsourced_professionals(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'contract',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (company_id IS NOT NULL OR professional_id IS NOT NULL)
);

ALTER TABLE public.outsourced_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager gerenciam documentos terceirizados"
  ON public.outsourced_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Terceirizado vê seus próprios documentos"
  ON public.outsourced_documents FOR SELECT TO authenticated
  USING (
    professional_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.outsourced_professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );

-- 5. Bucket privado para contratos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('outsourced-contracts', 'outsourced-contracts', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin/manager gerenciam contratos terceirizados (storage)"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'outsourced-contracts'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    bucket_id = 'outsourced-contracts'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- 6. Funções de acesso por loja
CREATE OR REPLACE FUNCTION public.outsourced_has_store_access(_user_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outsourced_professional_stores ps
    JOIN public.outsourced_professionals p ON p.id = ps.professional_id
    WHERE p.user_id = _user_id
      AND ps.store_id = _store_id
      AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.outsourced_accessible_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.store_id
  FROM public.outsourced_professional_stores ps
  JOIN public.outsourced_professionals p ON p.id = ps.professional_id
  WHERE p.user_id = _user_id AND p.status = 'active';
$$;

-- 7. Acesso de nutricionista terceirizado ao NutriControl e Infrações das lojas vinculadas
CREATE POLICY "Nutricionista terceirizado acessa nutri_day_records"
  ON public.nutri_day_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'nutritionist') AND public.outsourced_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.has_role(auth.uid(), 'nutritionist') AND public.outsourced_has_store_access(auth.uid(), store_id));

CREATE POLICY "Nutricionista terceirizado acessa nutri_maintenance_records"
  ON public.nutri_maintenance_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'nutritionist') AND public.outsourced_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.has_role(auth.uid(), 'nutritionist') AND public.outsourced_has_store_access(auth.uid(), store_id));

CREATE POLICY "Nutricionista terceirizado vê funcionários das lojas vinculadas"
  ON public.employees FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'nutritionist')
    AND public.outsourced_has_store_access(auth.uid(), allocated_store_id)
  );

CREATE POLICY "Nutricionista terceirizado vê infrações"
  ON public.employee_infractions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'nutritionist') AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id
        AND public.outsourced_has_store_access(auth.uid(), e.allocated_store_id)
    )
  );

CREATE POLICY "Nutricionista terceirizado registra infrações"
  ON public.employee_infractions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'nutritionist') AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id
        AND public.outsourced_has_store_access(auth.uid(), e.allocated_store_id)
    )
  );

CREATE POLICY "Nutricionista terceirizado vê tipos de infração"
  ON public.infraction_types FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'nutritionist'));

CREATE POLICY "Nutricionista terceirizado vê lojas vinculadas"
  ON public.stores FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'nutritionist')
    AND public.outsourced_has_store_access(auth.uid(), id)
  );

-- 8. Índices
CREATE INDEX IF NOT EXISTS idx_outsourced_prof_company ON public.outsourced_professionals(company_id);
CREATE INDEX IF NOT EXISTS idx_outsourced_prof_user ON public.outsourced_professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_outsourced_prof_stores_prof ON public.outsourced_professional_stores(professional_id);
CREATE INDEX IF NOT EXISTS idx_outsourced_prof_stores_store ON public.outsourced_professional_stores(store_id);
CREATE INDEX IF NOT EXISTS idx_outsourced_docs_company ON public.outsourced_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_outsourced_docs_professional ON public.outsourced_documents(professional_id);