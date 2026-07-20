
CREATE TABLE public.sms_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'textbee',
  api_key text NOT NULL,
  device_id text NOT NULL,
  phone_display text,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_senders TO authenticated;
GRANT ALL ON public.sms_senders TO service_role;
ALTER TABLE public.sms_senders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sms_senders" ON public.sms_senders FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_user(auth.uid()));
CREATE POLICY "Staff read sms_senders" ON public.sms_senders FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr') OR public.is_super_user(auth.uid()));

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_sender_id uuid REFERENCES public.sms_senders(id) ON DELETE SET NULL;
