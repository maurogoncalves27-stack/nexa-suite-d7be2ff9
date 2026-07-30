INSERT INTO public.notification_settings (alert_key, label, push_enabled, email_enabled, whatsapp_enabled)
VALUES ('checklist', 'Check-list expirado sem preenchimento', true, false, true)
ON CONFLICT (alert_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.checklist_expired_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  user_id uuid NOT NULL,
  shift_date date NOT NULL,
  store_id text,
  notified_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, user_id, shift_date)
);

GRANT SELECT ON public.checklist_expired_alerts_sent TO authenticated;
GRANT ALL ON public.checklist_expired_alerts_sent TO service_role;

ALTER TABLE public.checklist_expired_alerts_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e gestores veem alertas de checklist"
ON public.checklist_expired_alerts_sent
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));