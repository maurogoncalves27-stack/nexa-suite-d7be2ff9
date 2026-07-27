
ALTER TABLE public.whatsapp_senders
  ADD COLUMN IF NOT EXISTS last_status text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_alert_status text;

INSERT INTO public.notification_settings (alert_key, label, description, category_group, push_enabled, whatsapp_enabled, sms_enabled, extra_recipients)
VALUES ('whatsapp_health', 'WhatsApp desconectado', 'Alerta quando alguma instância Z-API cair (celular offline, sessão expirada).', 'sistema', false, false, true, '[]'::jsonb)
ON CONFLICT (alert_key) DO NOTHING;
