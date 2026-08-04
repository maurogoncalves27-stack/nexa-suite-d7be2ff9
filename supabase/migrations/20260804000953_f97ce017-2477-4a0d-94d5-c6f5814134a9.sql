CREATE TABLE public.system_hardcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  area text NOT NULL,
  file_path text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'P2',
  suggested_fix text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  assignee text,
  notes text,
  resolved_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_hardcodes TO authenticated;
GRANT ALL ON public.system_hardcodes TO service_role;

ALTER TABLE public.system_hardcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e gestores veem hardcodes"
ON public.system_hardcodes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins gerenciam hardcodes"
ON public.system_hardcodes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_system_hardcodes_updated_at
BEFORE UPDATE ON public.system_hardcodes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();