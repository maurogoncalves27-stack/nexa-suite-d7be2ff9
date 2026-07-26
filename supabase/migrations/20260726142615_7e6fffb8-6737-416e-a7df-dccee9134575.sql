
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS extra_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

WITH sac AS (
  SELECT id FROM public.whatsapp_senders WHERE label = 'Z-API Cliente (SAC)' LIMIT 1
)
UPDATE public.notification_settings ns
SET whatsapp_sender_id = sac.id,
    whatsapp_enabled = true,
    extra_recipients = jsonb_build_array(
      jsonb_build_object('phone','5561982203585','label','Extra 1'),
      jsonb_build_object('phone','5561998158029','label','Mauro'),
      jsonb_build_object('phone','5561999091894','label','Extra 3'),
      jsonb_build_object('phone','5561996077283','label','Extra 4'),
      jsonb_build_object('phone','5561982230019','label','Extra 5')
    ),
    updated_at = now()
FROM sac
WHERE ns.alert_key IN ('occurrence','timeclock','temperature');

-- Também cadastra na lista global de destinatários da câmara fria (usada pela função atual)
INSERT INTO public.nutri_temperature_alert_recipients (phone, name, store_id, active)
SELECT phone, name, NULL::uuid, true
FROM (VALUES
  ('5561982203585','Extra 1'),
  ('5561998158029','Mauro'),
  ('5561999091894','Extra 3'),
  ('5561996077283','Extra 4'),
  ('5561982230019','Extra 5')
) AS v(phone, name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.nutri_temperature_alert_recipients r
  WHERE r.phone = v.phone AND r.store_id IS NULL
);
