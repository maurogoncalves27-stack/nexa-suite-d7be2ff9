-- Tipos enumerados
DO $$ BEGIN
  CREATE TYPE public.task_periodicity AS ENUM ('daily','weekly','biweekly','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_assignment_scope AS ENUM ('employee','store');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela de tarefas (definições recorrentes)
CREATE TABLE IF NOT EXISTS public.employee_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  periodicity public.task_periodicity NOT NULL DEFAULT 'daily',
  scope public.task_assignment_scope NOT NULL DEFAULT 'employee',
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_tasks_target_check CHECK (
    (scope = 'employee' AND employee_id IS NOT NULL AND store_id IS NULL) OR
    (scope = 'store'    AND store_id    IS NOT NULL AND employee_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_employee_tasks_employee ON public.employee_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_store ON public.employee_tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_active ON public.employee_tasks(is_active);

ALTER TABLE public.employee_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Manager manage employee_tasks" ON public.employee_tasks;
CREATE POLICY "Admin/Manager manage employee_tasks"
  ON public.employee_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Employees view their tasks" ON public.employee_tasks;
CREATE POLICY "Employees view their tasks"
  ON public.employee_tasks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR (scope = 'employee' AND EXISTS (
      SELECT 1 FROM public.employees e WHERE e.id = employee_tasks.employee_id AND e.user_id = auth.uid()
    ))
    OR (scope = 'store' AND EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.user_id = auth.uid()
         AND (e.store_id = employee_tasks.store_id OR e.allocated_store_id = employee_tasks.store_id)
    ))
  );

DROP TRIGGER IF EXISTS update_employee_tasks_updated_at ON public.employee_tasks;
CREATE TRIGGER update_employee_tasks_updated_at
  BEFORE UPDATE ON public.employee_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de conclusões por período (uma linha por colaborador + tarefa + período)
CREATE TABLE IF NOT EXISTS public.employee_task_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.employee_tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, employee_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_task ON public.employee_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_employee ON public.employee_task_completions(employee_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_period ON public.employee_task_completions(period_start);

ALTER TABLE public.employee_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees insert own completion" ON public.employee_task_completions;
CREATE POLICY "Employees insert own completion"
  ON public.employee_task_completions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_task_completions.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  );

DROP POLICY IF EXISTS "Employees update own completion" ON public.employee_task_completions;
CREATE POLICY "Employees update own completion"
  ON public.employee_task_completions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_task_completions.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  );

DROP POLICY IF EXISTS "Employees delete own completion" ON public.employee_task_completions;
CREATE POLICY "Employees delete own completion"
  ON public.employee_task_completions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_task_completions.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  );

DROP POLICY IF EXISTS "View task completions" ON public.employee_task_completions;
CREATE POLICY "View task completions"
  ON public.employee_task_completions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_task_completions.employee_id AND e.user_id = auth.uid())
  );

-- Função: calcula o início do período corrente para uma periodicidade
CREATE OR REPLACE FUNCTION public.task_period_start(_periodicity public.task_periodicity, _ref DATE DEFAULT CURRENT_DATE)
RETURNS DATE
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _periodicity
    WHEN 'daily' THEN _ref
    WHEN 'weekly' THEN date_trunc('week', _ref)::date  -- segunda-feira
    WHEN 'biweekly' THEN
      CASE WHEN EXTRACT(DAY FROM _ref) <= 15
        THEN date_trunc('month', _ref)::date
        ELSE (date_trunc('month', _ref) + INTERVAL '15 days')::date
      END
    WHEN 'monthly' THEN date_trunc('month', _ref)::date
  END;
$$;