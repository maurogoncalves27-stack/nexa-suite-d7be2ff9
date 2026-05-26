CREATE TABLE IF NOT EXISTS public.late_punch_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  shift_start_time time,
  notified_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_late_punch_alerts_date ON public.late_punch_alerts_sent (schedule_date);

ALTER TABLE public.late_punch_alerts_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers view late alerts"
ON public.late_punch_alerts_sent
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));