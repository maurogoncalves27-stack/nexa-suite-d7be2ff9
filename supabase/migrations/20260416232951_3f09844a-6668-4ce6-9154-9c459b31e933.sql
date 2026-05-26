
-- Helper scalar function (avoid set-returning calls in RLS expressions)
CREATE OR REPLACE FUNCTION public.user_can_access_store(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_accessible_stores(_user_id) AS s
    WHERE s = _store_id
  );
$$;

-- =========================================================
-- WORK SHIFTS & SCHEDULES
-- =========================================================
CREATE TABLE public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
  is_day_off BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, schedule_date)
);

CREATE INDEX idx_work_schedules_store_date ON public.work_schedules(store_id, schedule_date);
CREATE INDEX idx_work_schedules_employee_date ON public.work_schedules(employee_id, schedule_date);

ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View shifts in accessible stores"
ON public.work_shifts FOR SELECT TO authenticated
USING (public.user_can_access_store(auth.uid(), store_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins/managers manage shifts"
ON public.work_shifts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "View schedules in accessible stores"
ON public.work_schedules FOR SELECT TO authenticated
USING (public.user_can_access_store(auth.uid(), store_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins/managers manage schedules"
ON public.work_schedules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_work_shifts_updated BEFORE UPDATE ON public.work_shifts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_work_schedules_updated BEFORE UPDATE ON public.work_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- CAREER TRACKS / LEVELS / PDI
-- =========================================================
CREATE TABLE public.career_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  area TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.career_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level_order INTEGER NOT NULL DEFAULT 1,
  salary_min NUMERIC(10,2),
  salary_max NUMERIC(10,2),
  requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (track_id, level_order)
);

CREATE TABLE public.employee_career (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.career_tracks(id) ON DELETE SET NULL,
  level_id UUID REFERENCES public.career_levels(id) ON DELETE SET NULL,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.development_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  actions TEXT,
  mentor_name TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  progress INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.career_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_career ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated views tracks"
ON public.career_tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tracks"
ON public.career_tracks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone authenticated views levels"
ON public.career_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage levels"
ON public.career_levels FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "View own/team career"
ON public.employee_career FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_career.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "Admins/managers manage career"
ON public.employee_career FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "View own/team PDI"
ON public.development_plans FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = development_plans.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "Admins/managers manage PDI"
ON public.development_plans FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_career_tracks_updated BEFORE UPDATE ON public.career_tracks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_career_levels_updated BEFORE UPDATE ON public.career_levels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_employee_career_updated BEFORE UPDATE ON public.employee_career
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_development_plans_updated BEFORE UPDATE ON public.development_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- INTERNSHIPS
-- =========================================================
CREATE TABLE public.internship_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  area TEXT,
  duration_months INTEGER NOT NULL DEFAULT 12,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.internships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  program_id UUID REFERENCES public.internship_programs(id) ON DELETE SET NULL,
  institution TEXT,
  course TEXT,
  supervisor_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.internship_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id UUID NOT NULL REFERENCES public.internships(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.internship_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id UUID NOT NULL REFERENCES public.internships(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score NUMERIC(3,1) NOT NULL,
  feedback TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internship_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated views programs"
ON public.internship_programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage programs"
ON public.internship_programs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "View own/team internship"
ON public.internships FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = internships.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "Admins/managers manage internships"
ON public.internships FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "View internship activities"
ON public.internship_activities FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM public.internships i
    JOIN public.employees e ON e.id = i.employee_id
    WHERE i.id = internship_activities.internship_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY "Admins/managers manage activities"
ON public.internship_activities FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "View internship evaluations"
ON public.internship_evaluations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM public.internships i
    JOIN public.employees e ON e.id = i.employee_id
    WHERE i.id = internship_evaluations.internship_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY "Admins/managers manage internship evaluations"
ON public.internship_evaluations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_internship_programs_updated BEFORE UPDATE ON public.internship_programs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_internships_updated BEFORE UPDATE ON public.internships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_internship_activities_updated BEFORE UPDATE ON public.internship_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- EMPLOYEE REQUESTS (Self-service)
-- =========================================================
CREATE TABLE public.employee_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  hr_response TEXT,
  responded_by UUID,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own/team requests"
ON public.employee_requests FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_requests.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "Employee creates own request"
ON public.employee_requests FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_requests.employee_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Admins/managers update requests"
ON public.employee_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins delete requests"
ON public.employee_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_employee_requests_updated BEFORE UPDATE ON public.employee_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
