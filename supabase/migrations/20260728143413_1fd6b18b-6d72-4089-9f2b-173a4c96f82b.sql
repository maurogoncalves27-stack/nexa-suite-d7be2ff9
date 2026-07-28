
-- Trocar default para o remetente saudável
UPDATE public.whatsapp_senders SET is_default = false WHERE is_default = true;
UPDATE public.whatsapp_senders SET is_default = true WHERE id = '9cf563e9-6728-4816-889f-93c76e8629f4';

-- Migrar alertas operacionais que estavam apontando pro SAC quebrado
UPDATE public.notification_settings
SET whatsapp_sender_id = '9cf563e9-6728-4816-889f-93c76e8629f4'
WHERE whatsapp_sender_id = '0b56b4a9-b89a-4da2-a293-5da73c7fc8a9'
  AND alert_key IN ('crm_reservation','delivery','network','occurrence','temperature');
