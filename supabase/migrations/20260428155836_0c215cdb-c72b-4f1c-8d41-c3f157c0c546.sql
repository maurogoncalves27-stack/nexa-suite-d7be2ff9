
-- Tabela principal de agendamento de treinamento por colaborador
CREATE TABLE public.training_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  location TEXT,
  store_id UUID REFERENCES public.stores(id),
  responsible_name TEXT NOT NULL,
  responsible_employee_id UUID REFERENCES public.employees(id),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);

-- Slots diários (escala) do treinamento
CREATE TABLE public.training_schedule_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.training_schedules(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  break_start TIME,
  break_end TIME,
  is_day_off BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, day_date)
);

CREATE INDEX idx_training_schedules_employee ON public.training_schedules(employee_id);
CREATE INDEX idx_training_schedule_days_schedule ON public.training_schedule_days(schedule_id);

ALTER TABLE public.training_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_schedule_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training schedules"
ON public.training_schedules FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = training_schedules.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
        OR e.user_id = auth.uid()
      )
  )
);

CREATE POLICY "Manage training schedules"
ON public.training_schedules FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = training_schedules.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = training_schedules.employee_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

CREATE POLICY "View training schedule days"
ON public.training_schedule_days FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.training_schedules s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.id = training_schedule_days.schedule_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
        OR e.user_id = auth.uid()
      )
  )
);

CREATE POLICY "Manage training schedule days"
ON public.training_schedule_days FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.training_schedules s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.id = training_schedule_days.schedule_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.training_schedules s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.id = training_schedule_days.schedule_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT public.user_accessible_stores(auth.uid())))
      )
  )
);

CREATE TRIGGER update_training_schedules_updated_at
BEFORE UPDATE ON public.training_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_training_schedule_days_updated_at
BEFORE UPDATE ON public.training_schedule_days
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
