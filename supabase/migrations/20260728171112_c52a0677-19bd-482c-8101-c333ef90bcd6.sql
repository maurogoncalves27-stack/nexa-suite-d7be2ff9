
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS sms_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO public.notification_settings
  (alert_key, label, description, category_group, push_enabled, whatsapp_enabled, sms_enabled, email_enabled)
VALUES
  ('candidate_confirmation',
   'Confirmação para candidatos (vagas e candidaturas)',
   'Mensagens automáticas enviadas ao candidato: candidatura recebida, entrevista agendada, aprovação/reprovação e lembretes. Hoje sai apenas por e-mail — ative WhatsApp/SMS aqui se quiser reforçar por outro canal.',
   'RH', false, false, false, true)
ON CONFLICT (alert_key) DO NOTHING;
