CREATE TABLE public.hr_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'info' CHECK (priority IN ('info','warning','urgent')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','store','employee')),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scope_target_check CHECK (
    (scope = 'global' AND store_id IS NULL AND employee_id IS NULL) OR
    (scope = 'store' AND store_id IS NOT NULL AND employee_id IS NULL) OR
    (scope = 'employee' AND employee_id IS NOT NULL)
  )
);

CREATE INDEX idx_hr_announcements_active ON public.hr_announcements(is_active);
CREATE INDEX idx_hr_announcements_store ON public.hr_announcements(store_id);
CREATE INDEX idx_hr_announcements_employee ON public.hr_announcements(employee_id);

ALTER TABLE public.hr_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager manage announcements"
  ON public.hr_announcements FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Employees view targeted announcements"
  ON public.hr_announcements FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR (
      is_active = true AND (
        scope = 'global'
        OR (scope = 'store' AND store_id IN (
          SELECT e.store_id FROM public.employees e WHERE e.user_id = auth.uid()
          UNION
          SELECT e.allocated_store_id FROM public.employees e WHERE e.user_id = auth.uid() AND e.allocated_store_id IS NOT NULL
        ))
        OR (scope = 'employee' AND employee_id IN (
          SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
        ))
      )
    )
  );

CREATE TRIGGER update_hr_announcements_updated_at
  BEFORE UPDATE ON public.hr_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();