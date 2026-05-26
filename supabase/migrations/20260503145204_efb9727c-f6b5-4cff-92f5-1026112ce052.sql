
-- =========================================================
-- 1) STORES: separar credenciais fiscais em tabela própria
-- =========================================================
CREATE TABLE IF NOT EXISTS public.store_fiscal_credentials (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  nfce_csc_id_homolog TEXT,
  nfce_csc_token_homolog TEXT,
  nfce_csc_id_prod TEXT,
  nfce_csc_token_prod TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_fiscal_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage fiscal credentials"
ON public.store_fiscal_credentials
FOR ALL
TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
)
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
);

-- Migrar valores existentes
INSERT INTO public.store_fiscal_credentials (store_id, nfce_csc_id_homolog, nfce_csc_token_homolog, nfce_csc_id_prod, nfce_csc_token_prod)
SELECT id, nfce_csc_id_homolog, nfce_csc_token_homolog, nfce_csc_id_prod, nfce_csc_token_prod
FROM public.stores
WHERE nfce_csc_id_homolog IS NOT NULL OR nfce_csc_token_homolog IS NOT NULL
   OR nfce_csc_id_prod IS NOT NULL OR nfce_csc_token_prod IS NOT NULL
ON CONFLICT (store_id) DO NOTHING;

-- Remover colunas sensíveis de stores
ALTER TABLE public.stores DROP COLUMN IF EXISTS nfce_csc_id_homolog;
ALTER TABLE public.stores DROP COLUMN IF EXISTS nfce_csc_token_homolog;
ALTER TABLE public.stores DROP COLUMN IF EXISTS nfce_csc_id_prod;
ALTER TABLE public.stores DROP COLUMN IF EXISTS nfce_csc_token_prod;

-- =========================================================
-- 2) MONTHLY_REVENUE: restringir SELECT a staff
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can view monthly_revenue" ON public.monthly_revenue;
CREATE POLICY "Staff can view monthly_revenue"
ON public.monthly_revenue
FOR SELECT
TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'contabilidade'::app_role)
);

-- =========================================================
-- 3) JOB_APPLICATIONS: restringir SELECT/UPDATE/DELETE a recrutamento
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can view applications" ON public.job_applications;
DROP POLICY IF EXISTS "Authenticated can update applications" ON public.job_applications;
DROP POLICY IF EXISTS "Authenticated can delete applications" ON public.job_applications;

CREATE POLICY "Recruitment can view applications"
ON public.job_applications FOR SELECT TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);
CREATE POLICY "Recruitment can update applications"
ON public.job_applications FOR UPDATE TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
)
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);
CREATE POLICY "Recruitment can delete applications"
ON public.job_applications FOR DELETE TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);

-- =========================================================
-- 4) INTERNSHIP_CANDIDATES: remover SELECT permissivo
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view internship candidates" ON public.internship_candidates;
-- (a policy "HR can manage internship candidates" já cobre SELECT para staff/RH/super)

-- =========================================================
-- 5) CANDIDATE_MESSAGE_LOGS: restringir SELECT
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view message logs" ON public.candidate_message_logs;
CREATE POLICY "Recruitment can view message logs"
ON public.candidate_message_logs FOR SELECT TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);

-- =========================================================
-- 6) JOB_INTERVIEW_SLOTS: trocar ALL true por staff-only
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can manage slots" ON public.job_interview_slots;
CREATE POLICY "Recruitment can manage slots"
ON public.job_interview_slots FOR ALL TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
)
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);

-- =========================================================
-- 7) GAS_VOUCHER_REQUESTS: UPDATE só staff
-- =========================================================
DROP POLICY IF EXISTS "Authenticated updates gas requests" ON public.gas_voucher_requests;
CREATE POLICY "Staff updates gas requests"
ON public.gas_voucher_requests FOR UPDATE TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- =========================================================
-- 8) TRANSPORT_VOUCHER_SETTINGS: UPDATE/INSERT só staff
-- =========================================================
DROP POLICY IF EXISTS "Authenticated update transport_voucher_settings" ON public.transport_voucher_settings;
DROP POLICY IF EXISTS "Authenticated upsert transport_voucher_settings" ON public.transport_voucher_settings;
CREATE POLICY "Staff update transport_voucher_settings"
ON public.transport_voucher_settings FOR UPDATE TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);
CREATE POLICY "Staff insert transport_voucher_settings"
ON public.transport_voucher_settings FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- =========================================================
-- 9) RECIPE_BRANDS: INSERT/DELETE só staff
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert recipe_brands" ON public.recipe_brands;
DROP POLICY IF EXISTS "Authenticated can delete recipe_brands" ON public.recipe_brands;
CREATE POLICY "Staff can insert recipe_brands"
ON public.recipe_brands FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);
CREATE POLICY "Staff can delete recipe_brands"
ON public.recipe_brands FOR DELETE TO authenticated
USING (
  public.is_super_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);
