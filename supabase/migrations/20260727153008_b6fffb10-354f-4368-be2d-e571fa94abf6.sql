
insert into public.notification_settings (alert_key, label, description, category_group, push_enabled, whatsapp_enabled, sms_enabled, email_enabled, extra_recipients, email_recipients)
values (
  'maintenance',
  'Manutenção — nova solicitação',
  'Alerta imediato para gestores quando um chamado de manutenção é aberto na loja.',
  'Operacional',
  true, true, false, false, '[]'::jsonb, '[]'::jsonb
)
on conflict (alert_key) do nothing;
