
CREATE TABLE IF NOT EXISTS public.payroll_edit_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_year INT NOT NULL,
  reference_month INT NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_year, reference_month)
);

ALTER TABLE public.payroll_edit_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payroll locks"
  ON public.payroll_edit_locks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can acquire payroll lock"
  ON public.payroll_edit_locks FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner or expired can update payroll lock"
  ON public.payroll_edit_locks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR last_heartbeat < now() - interval '5 minutes')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner or expired can delete payroll lock"
  ON public.payroll_edit_locks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR last_heartbeat < now() - interval '5 minutes');

ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll_edit_locks;
