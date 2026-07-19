
-- 1) Remetentes de WhatsApp (credenciais Z-API por número)
CREATE TABLE IF NOT EXISTS public.whatsapp_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  phone_display TEXT,
  zapi_instance_id TEXT NOT NULL,
  zapi_token TEXT NOT NULL,
  zapi_client_token TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_senders TO authenticated;
GRANT ALL ON public.whatsapp_senders TO service_role;

ALTER TABLE public.whatsapp_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view whatsapp senders"
  ON public.whatsapp_senders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert whatsapp senders"
  ON public.whatsapp_senders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update whatsapp senders"
  ON public.whatsapp_senders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete whatsapp senders"
  ON public.whatsapp_senders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Garante um único default
CREATE OR REPLACE FUNCTION public.enforce_single_default_whatsapp_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.whatsapp_senders
      SET is_default = false
      WHERE id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_single_default_sender
  BEFORE INSERT OR UPDATE ON public.whatsapp_senders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_whatsapp_sender();

CREATE TRIGGER trg_update_whatsapp_senders_updated_at
  BEFORE UPDATE ON public.whatsapp_senders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) Configuração central de alertas/notificações
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  category_group TEXT NOT NULL DEFAULT 'Geral',
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_sender_id UUID REFERENCES public.whatsapp_senders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Leitura ampla (edge functions/serviços já usam service_role, mas UI usuário lê)
CREATE POLICY "Authenticated can view notification settings"
  ON public.notification_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert notification settings"
  ON public.notification_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update notification settings"
  ON public.notification_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete notification settings"
  ON public.notification_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dos alertas conhecidos hoje no sistema
INSERT INTO public.notification_settings (alert_key, label, description, category_group, push_enabled, whatsapp_enabled) VALUES
  ('timeclock',         'Ponto — atrasos e ausências',        'Alertas de atraso >15min e falta de batida (colaboradores e freelancers).', 'RH',           true, true),
  ('hr',                'RH — solicitações e mudanças',       'Pedidos de férias, troca de escala, adiantamento e afins.',                'RH',           true, false),
  ('announcement',      'Avisos e comunicados',               'Comunicados internos publicados no portal.',                               'Comunicação',  true, true),
  ('payslip',           'Holerite disponível',                'Aviso ao colaborador quando o holerite é publicado.',                      'RH',           true, true),
  ('schedule',          'Escala publicada / alterada',        'Notificação ao colaborador quando a escala muda.',                         'RH',           true, false),
  ('appointment',       'Compromissos e reuniões',            'Lembretes de agenda.',                                                     'Agenda',       true, false),
  ('mental_health',     'Saúde mental / check-in',            'Alertas do módulo de saúde mental.',                                       'RH',           true, false),
  ('occurrence',        'Ocorrências operacionais',           'Ocorrências abertas nas lojas.',                                           'Operação',     true, true),
  ('network',           'Rede das lojas offline',             'Alerta quando uma loja fica sem internet.',                                'Infra',        true, true),
  ('temperature',       'Temperatura fora do padrão',         'Alertas de temperatura de câmaras/freezers.',                              'Operação',     true, true),
  ('delivery',          'Entregas (delivery)',                'Falhas e eventos críticos de entrega.',                                    'Operação',     true, false),
  ('customer_complaint','Reclamação de cliente (WhatsApp)',   'Nova reclamação registrada pelo SAC.',                                     'Cliente',      true, true),
  ('giana_feedback',    'Feedback Giana (avaliações)',        'Novos feedbacks / avaliações críticas.',                                   'Cliente',      true, false),
  ('candidate_message', 'Recrutamento — candidatos',          'Novas mensagens/movimentações no pipeline de candidatos.',                 'Recrutamento', true, false)
ON CONFLICT (alert_key) DO NOTHING;
