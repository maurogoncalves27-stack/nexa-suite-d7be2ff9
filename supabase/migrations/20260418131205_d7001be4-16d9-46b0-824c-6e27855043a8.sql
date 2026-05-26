-- Modelos de texto reutilizáveis para advertências
CREATE TABLE public.warning_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.warning_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e gerentes gerenciam modelos de advertência"
  ON public.warning_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_warning_templates_updated_at
  BEFORE UPDATE ON public.warning_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Advertências emitidas para colaboradores
CREATE TABLE public.employee_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by UUID,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | signed | refused
  signed_at TIMESTAMPTZ,
  signature_path TEXT,
  refused_at TIMESTAMPTZ,
  refusal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_warnings_employee ON public.employee_warnings(employee_id);
CREATE INDEX idx_employee_warnings_status ON public.employee_warnings(status);

ALTER TABLE public.employee_warnings ENABLE ROW LEVEL SECURITY;

-- Admins/gerentes veem e gerenciam todas
CREATE POLICY "Gestores veem todas as advertências"
  ON public.employee_warnings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Gestores criam advertências"
  ON public.employee_warnings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Gestores atualizam advertências"
  ON public.employee_warnings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Gestores excluem advertências"
  ON public.employee_warnings FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Colaborador vê suas próprias advertências
CREATE POLICY "Colaborador vê suas advertências"
  ON public.employee_warnings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_warnings.employee_id AND e.user_id = auth.uid()
    )
  );

-- Colaborador atualiza apenas a própria (para assinar/recusar)
CREATE POLICY "Colaborador assina/recusa sua advertência"
  ON public.employee_warnings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_warnings.employee_id AND e.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_employee_warnings_updated_at
  BEFORE UPDATE ON public.employee_warnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para assinaturas de advertências
INSERT INTO storage.buckets (id, name, public)
VALUES ('warning-signatures', 'warning-signatures', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Assinaturas de advertência são públicas para leitura"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'warning-signatures');

CREATE POLICY "Usuários autenticados enviam assinaturas de advertência"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'warning-signatures' AND auth.uid() IS NOT NULL);