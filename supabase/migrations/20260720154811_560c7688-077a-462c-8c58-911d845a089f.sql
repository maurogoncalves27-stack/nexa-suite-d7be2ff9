CREATE TABLE IF NOT EXISTS public.system_health_state (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB
);
GRANT SELECT ON public.system_health_state TO authenticated;
GRANT ALL ON public.system_health_state TO service_role;
ALTER TABLE public.system_health_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read health state" ON public.system_health_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));