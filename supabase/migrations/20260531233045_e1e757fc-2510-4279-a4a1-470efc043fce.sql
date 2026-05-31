
-- 1) Opt-out por colaborador
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

-- 2) Log de envios
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  employee_id uuid,
  phone text,
  message text NOT NULL,
  category text,
  tag text,
  provider text NOT NULL DEFAULT 'zapi',
  status text NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_notifications_log TO authenticated;
GRANT ALL ON public.whatsapp_notifications_log TO service_role;

ALTER TABLE public.whatsapp_notifications_log ENABLE ROW LEVEL SECURITY;

-- Admin/HR/manager veem tudo
CREATE POLICY "wa_log_admin_select" ON public.whatsapp_notifications_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'manager')
  );

-- Colaborador vê os próprios
CREATE POLICY "wa_log_self_select" ON public.whatsapp_notifications_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wa_log_user_id ON public.whatsapp_notifications_log(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_log_employee_id ON public.whatsapp_notifications_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_wa_log_created_at ON public.whatsapp_notifications_log(created_at DESC);
