-- Tabela de compromissos/reuniões
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  meeting_url TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE,
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','store','employee')),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  reminder_offsets_min INTEGER[] NOT NULL DEFAULT ARRAY[60, 1440],
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','done')),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_start_at ON public.appointments(start_at);
CREATE INDEX idx_appointments_scope ON public.appointments(scope, store_id, employee_id);

-- Tabela de controle de lembretes enviados
CREATE TABLE public.appointment_reminders_sent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  offset_min INTEGER NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, offset_min)
);

-- Trigger updated_at
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders_sent ENABLE ROW LEVEL SECURITY;

-- Admin/Manager: gerenciam tudo
CREATE POLICY "Staff can manage appointments"
  ON public.appointments FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Colaborador: vê compromissos que o atingem
CREATE POLICY "Employees view their appointments"
  ON public.appointments FOR SELECT
  USING (
    scope = 'all'
    OR (scope = 'store' AND store_id IN (
      SELECT COALESCE(allocated_store_id, store_id) FROM public.employees WHERE user_id = auth.uid()
    ))
    OR (scope = 'employee' AND employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

-- Reminders: apenas staff
CREATE POLICY "Staff manage reminders sent"
  ON public.appointment_reminders_sent FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));