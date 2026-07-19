
CREATE TABLE public.whatsapp_senders (
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
CREATE POLICY "admins manage whatsapp senders"
  ON public.whatsapp_senders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.notification_settings (
  alert_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category_group TEXT NOT NULL DEFAULT 'geral',
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_sender_id UUID REFERENCES public.whatsapp_senders(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage notification settings"
  ON public.notification_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff read notification settings"
  ON public.notification_settings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'hr')
  );

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_wsenders_touch BEFORE UPDATE ON public.whatsapp_senders
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_notifsettings_touch BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_wsender_single_default()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.whatsapp_senders SET is_default = false
      WHERE id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_wsender_single_default
  AFTER INSERT OR UPDATE OF is_default ON public.whatsapp_senders
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.tg_wsender_single_default();

INSERT INTO public.notification_settings (alert_key, label, description, category_group, push_enabled, whatsapp_enabled) VALUES
  ('timeclock', 'Atraso de ponto', 'CLT ou freelancer com atraso ≥ 15 min sem entrada registrada.', 'RH', true, true),
  ('hr', 'RH geral', 'Solicitações, advertências, alterações cadastrais.', 'RH', true, false),
  ('announcement', 'Avisos e comunicados', 'Comunicados internos publicados pelo RH.', 'RH', true, true),
  ('payslip', 'Holerite e recibos', 'Envio de holerites, férias, rescisão.', 'RH', true, true),
  ('schedule', 'Escala e férias', 'Alterações de escala, aprovações de férias.', 'RH', true, false),
  ('appointment', 'Lembrete de consulta médica', 'Lembrete automático de ASO/consulta agendada.', 'RH', true, true),
  ('mental_health', 'Saúde mental (follow-up)', 'Alerta ao RH quando humor coletado indica risco.', 'RH', true, false),
  ('occurrence', 'Ocorrências operacionais', 'Ocorrências registradas na loja (sistema/atendimento).', 'Operacional', true, true),
  ('network', 'Rede / WAN offline', 'MikroTik ou link caiu.', 'Operacional', true, true),
  ('temperature', 'Temperatura (EMS)', 'Sensores de câmara/freezer fora do range.', 'Operacional', true, true),
  ('delivery', 'Entregas / Motoboy', 'Rota, atraso ou incidente com entregador.', 'Operacional', true, false),
  ('customer_complaint', 'Reclamação de cliente', 'Reclamações capturadas no WhatsApp cliente (SAC).', 'Cliente', true, false),
  ('giana_feedback', 'Feedback Giana', 'Solicitações de feedback do agente Giana.', 'Cliente', true, false),
  ('candidate_message', 'Mensagens de candidatos', 'Interações no processo seletivo (recrutamento).', 'RH', true, false)
ON CONFLICT (alert_key) DO NOTHING;
