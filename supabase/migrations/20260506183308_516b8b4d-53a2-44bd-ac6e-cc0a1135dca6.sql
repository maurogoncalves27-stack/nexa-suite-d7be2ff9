-- 1) Vincular freelancer a um usuário (login próprio)
ALTER TABLE public.freelancers
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_freelancers_user_id ON public.freelancers(user_id);

-- 2) Função auxiliar para checar se o usuário é um freelancer
CREATE OR REPLACE FUNCTION public.is_freelancer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.freelancers WHERE user_id = _user_id AND status = 'active')
$$;

-- 3) Função para o freelancer vincular login ao próprio cadastro pelo CPF
CREATE OR REPLACE FUNCTION public.link_freelancer_account(_cpf TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_email TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;

  -- Já vinculado a este usuário? retorna direto
  SELECT id INTO v_id FROM public.freelancers WHERE user_id = v_user LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Procura cadastro pelo CPF (apenas dígitos), sem usuário ainda
  SELECT id INTO v_id
  FROM public.freelancers
  WHERE regexp_replace(coalesce(cpf,''), '\D', '', 'g') = regexp_replace(_cpf, '\D', '', 'g')
    AND user_id IS NULL
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'freelancer_not_found_or_already_linked';
  END IF;

  UPDATE public.freelancers
  SET user_id = v_user,
      email = COALESCE(email, v_email),
      status = 'active'
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

-- Permitir que freelancer veja/edite o próprio cadastro (sem mexer nas policies de staff existentes)
CREATE POLICY "Freelancer can view own record"
ON public.freelancers FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Freelancer can update own record"
ON public.freelancers FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- 4) Vagas de diária
CREATE TABLE public.freelancer_job_openings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  work_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','completed','cancelled')),
  filled_freelancer_id UUID REFERENCES public.freelancers(id) ON DELETE SET NULL,
  filled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  payment_id UUID REFERENCES public.freelancer_daily_payments(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_freelancer_job_openings_status ON public.freelancer_job_openings(status);
CREATE INDEX idx_freelancer_job_openings_work_date ON public.freelancer_job_openings(work_date);

ALTER TABLE public.freelancer_job_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage openings"
ON public.freelancer_job_openings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Freelancers can view openings"
ON public.freelancer_job_openings FOR SELECT TO authenticated
USING (public.is_freelancer(auth.uid()));

CREATE TRIGGER update_freelancer_job_openings_updated_at
BEFORE UPDATE ON public.freelancer_job_openings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Candidaturas
CREATE TABLE public.freelancer_job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.freelancer_job_openings(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  notes TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, freelancer_id)
);
CREATE INDEX idx_freelancer_job_apps_job ON public.freelancer_job_applications(job_id);
CREATE INDEX idx_freelancer_job_apps_freelancer ON public.freelancer_job_applications(freelancer_id);

ALTER TABLE public.freelancer_job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage applications"
ON public.freelancer_job_applications FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Freelancer view own applications"
ON public.freelancer_job_applications FOR SELECT TO authenticated
USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE POLICY "Freelancer apply to open jobs"
ON public.freelancer_job_applications FOR INSERT TO authenticated
WITH CHECK (
  freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.freelancer_job_openings o WHERE o.id = job_id AND o.status = 'open')
);

CREATE POLICY "Freelancer withdraw own application"
ON public.freelancer_job_applications FOR UPDATE TO authenticated
USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()))
WITH CHECK (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE TRIGGER update_freelancer_job_applications_updated_at
BEFORE UPDATE ON public.freelancer_job_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();