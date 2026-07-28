
-- Garante linha para alerta 'maintenance'
INSERT INTO public.notification_settings (alert_key, label, whatsapp_enabled, extra_recipients)
VALUES ('maintenance', 'Manutenção', true, '[]'::jsonb)
ON CONFLICT (alert_key) DO NOTHING;

-- Dropa tabelas antigas (recipientes migrados para notification_settings.extra_recipients)
DROP TABLE IF EXISTS public.network_alert_recipients CASCADE;
DROP TABLE IF EXISTS public.nutri_temperature_alert_recipients CASCADE;
