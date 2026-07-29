ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS critical_alert_sent_at timestamptz;

INSERT INTO public.notification_settings (alert_key, label, description, category_group, whatsapp_enabled, whatsapp_sender_id, extra_recipients, email_enabled, sms_enabled, push_enabled)
VALUES (
  'crm_ticket_critico',
  'Chamado crítico da Giana (CRM)',
  'Alerta imediato aos gestores quando a triagem classifica uma conversa/chamado como crítico ou de alta severidade.',
  'CRM',
  true,
  '0b56b4a9-b89a-4da2-a293-5da73c7fc8a9',
  '[{"label":"Mauro","phone":"5561998158029"},{"label":"Lilian","phone":"5561982203585"},{"label":"RH","phone":"5561982230019"}]'::jsonb,
  false, false, false
)
ON CONFLICT (alert_key) DO NOTHING;