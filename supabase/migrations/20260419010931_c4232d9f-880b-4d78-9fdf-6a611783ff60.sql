-- Tabela de assinaturas de contrato de trabalho
CREATE TABLE public.contract_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_signatures_employee ON public.contract_signatures(employee_id);
CREATE INDEX idx_contract_signatures_user ON public.contract_signatures(user_id);

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

-- Colaborador vê e cria sua própria assinatura
CREATE POLICY "Employee can view own contract signatures"
ON public.contract_signatures FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Employee can sign own contract"
ON public.contract_signatures FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  )
);

-- Admin e manager veem todas as assinaturas
CREATE POLICY "Admins and managers can view all contract signatures"
ON public.contract_signatures FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

-- Admin pode deletar (correção de erros)
CREATE POLICY "Admins can delete contract signatures"
ON public.contract_signatures FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));