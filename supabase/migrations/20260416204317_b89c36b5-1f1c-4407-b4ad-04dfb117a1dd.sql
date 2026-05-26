-- Catálogo de tipos de infração
CREATE TABLE public.infraction_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_weight NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.infraction_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view infraction types"
  ON public.infraction_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage infraction types"
  ON public.infraction_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_infraction_types_updated_at
  BEFORE UPDATE ON public.infraction_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ocorrências de infrações
CREATE TABLE public.employee_infractions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  infraction_type_id UUID NOT NULL,
  cycle_id UUID,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  applied_weight NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_infractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View employee infractions"
  ON public.employee_infractions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_infractions.employee_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
          OR e.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Manage employee infractions"
  ON public.employee_infractions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_infractions.employee_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_infractions.employee_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'manager'::app_role) AND e.store_id IN (SELECT user_accessible_stores(auth.uid())))
        )
    )
  );

CREATE TRIGGER update_employee_infractions_updated_at
  BEFORE UPDATE ON public.employee_infractions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_employee_infractions_employee ON public.employee_infractions(employee_id);
CREATE INDEX idx_employee_infractions_cycle ON public.employee_infractions(cycle_id);
CREATE INDEX idx_employee_infractions_date ON public.employee_infractions(occurred_on);

-- Adicionar valor por ponto de infração no ciclo
ALTER TABLE public.evaluation_cycles
  ADD COLUMN bonus_value_per_point NUMERIC NOT NULL DEFAULT 0;