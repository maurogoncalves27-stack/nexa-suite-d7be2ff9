-- Tabela para registrar aceites de Termos de Uso e LGPD
CREATE TABLE public.lgpd_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver e criar seu próprio consentimento
CREATE POLICY "Users can view their own consent"
  ON public.lgpd_consents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own consent"
  ON public.lgpd_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin pode visualizar todos os aceites
CREATE POLICY "Admins can view all consents"
  ON public.lgpd_consents FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));