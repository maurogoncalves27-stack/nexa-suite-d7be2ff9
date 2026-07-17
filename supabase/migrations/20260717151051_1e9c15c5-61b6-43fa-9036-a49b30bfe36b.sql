
-- 1. Opt-out de humor no perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mood_optout_until timestamptz;

-- 2. Riscos psicossociais (PGR / NR-1)
CREATE TABLE IF NOT EXISTS public.psychosocial_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  probability text NOT NULL DEFAULT 'medium',
  source text NOT NULL DEFAULT 'manual',
  action_plan text,
  responsible_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  deadline date,
  status text NOT NULL DEFAULT 'open',
  next_review_at date DEFAULT (CURRENT_DATE + INTERVAL '12 months'),
  auto_generated boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.psychosocial_risks TO authenticated;
GRANT ALL ON public.psychosocial_risks TO service_role;

ALTER TABLE public.psychosocial_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR/admin view psychosocial risks"
  ON public.psychosocial_risks FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'mental_health'::app_role)
    OR (has_role(auth.uid(), 'manager'::app_role)
        AND store_id IN (SELECT user_accessible_stores(auth.uid())))
  );

CREATE POLICY "HR/admin manage psychosocial risks"
  ON public.psychosocial_risks FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'mental_health'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'mental_health'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_psychosocial_risks_store ON public.psychosocial_risks(store_id);
CREATE INDEX IF NOT EXISTS idx_psychosocial_risks_status ON public.psychosocial_risks(status);

CREATE TRIGGER trg_psychosocial_risks_updated_at
  BEFORE UPDATE ON public.psychosocial_risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Trigger: atestado com CID F gera sugestão de risco psicossocial quando >= 3 em 90d na mesma loja
CREATE OR REPLACE FUNCTION public.check_mental_health_cid_cluster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_count int;
BEGIN
  IF NEW.cid_code IS NULL OR upper(left(NEW.cid_code, 1)) <> 'F' THEN
    RETURN NEW;
  END IF;

  SELECT e.store_id INTO v_store_id FROM public.employees e WHERE e.id = NEW.employee_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(DISTINCT mc.employee_id) INTO v_count
  FROM public.medical_certificates mc
  JOIN public.employees e ON e.id = mc.employee_id
  WHERE e.store_id = v_store_id
    AND upper(left(coalesce(mc.cid_code,''), 1)) = 'F'
    AND mc.start_date >= (CURRENT_DATE - INTERVAL '90 days');

  IF v_count >= 3 THEN
    -- Só cria uma sugestão aberta ativa por loja
    IF NOT EXISTS (
      SELECT 1 FROM public.psychosocial_risks
      WHERE store_id = v_store_id
        AND auto_generated = true
        AND status IN ('open','in_progress')
        AND source = 'cid_f_cluster'
    ) THEN
      INSERT INTO public.psychosocial_risks
        (store_id, category, description, severity, probability, source, auto_generated, status)
      VALUES (
        v_store_id,
        'saude_mental',
        format('Cluster de %s afastamentos com CID F (transtornos mentais) nos últimos 90 dias. Investigar causas e definir plano de ação.', v_count),
        'high',
        'high',
        'cid_f_cluster',
        true,
        'open'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_mental_health_cid_cluster ON public.medical_certificates;
CREATE TRIGGER trg_check_mental_health_cid_cluster
  AFTER INSERT ON public.medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.check_mental_health_cid_cluster();
