
-- 1) Insere o alerta crm_reservation na tabela dinâmica
INSERT INTO public.notification_settings
  (alert_key, label, description, category_group, push_enabled, whatsapp_enabled, sms_enabled, email_enabled, extra_recipients, email_recipients)
VALUES
  ('crm_reservation',
   'Nova reserva (CRM)',
   'Aviso enviado à loja quando uma reserva é criada pelo chat/formulário público do site.',
   'CRM',
   true, true, false, false, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (alert_key) DO NOTHING;

-- 2) Migra o telefone da loja (parme_site_settings.reservations.whatsappStorePhone)
--    para extra_recipients do alerta crm_reservation, respeitando notifyEnabled.
DO $$
DECLARE
  v jsonb;
  phone text;
  enabled boolean;
BEGIN
  SELECT value INTO v FROM public.parme_site_settings WHERE key = 'reservations';
  IF v IS NULL THEN RETURN; END IF;
  phone := regexp_replace(coalesce(v->>'whatsappStorePhone',''), '\D', '', 'g');
  enabled := coalesce((v->>'notifyEnabled')::boolean, true);
  IF phone <> '' THEN
    UPDATE public.notification_settings
       SET extra_recipients = jsonb_build_array(jsonb_build_object('phone', phone)),
           whatsapp_enabled = enabled
     WHERE alert_key = 'crm_reservation'
       AND (extra_recipients IS NULL OR extra_recipients = '[]'::jsonb);
  END IF;
END $$;
