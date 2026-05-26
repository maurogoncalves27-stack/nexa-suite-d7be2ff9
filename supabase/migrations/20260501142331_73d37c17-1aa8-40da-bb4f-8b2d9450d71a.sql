-- Configuração de obrigatoriedade de ponto e impacto em folha
-- Defaults por cargo + override por colaborador

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS time_clock_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS time_clock_payroll boolean NOT NULL DEFAULT true;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS time_clock_required boolean,
  ADD COLUMN IF NOT EXISTS time_clock_payroll boolean;

COMMENT ON COLUMN public.positions.time_clock_required IS 'Default por cargo: colaboradores deste cargo devem bater ponto';
COMMENT ON COLUMN public.positions.time_clock_payroll IS 'Default por cargo: ponto deste cargo impacta cálculo da folha';
COMMENT ON COLUMN public.employees.time_clock_required IS 'Override individual; se NULL usa o default do cargo';
COMMENT ON COLUMN public.employees.time_clock_payroll IS 'Override individual; se NULL usa o default do cargo';

-- Helper: resolver flag efetiva
CREATE OR REPLACE FUNCTION public.employee_time_clock_required(_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    e.time_clock_required,
    p.time_clock_required,
    true
  )
  FROM public.employees e
  LEFT JOIN public.positions p ON p.name = e.position
  WHERE e.id = _employee_id;
$$;

CREATE OR REPLACE FUNCTION public.employee_time_clock_payroll(_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    e.time_clock_payroll,
    p.time_clock_payroll,
    true
  )
  FROM public.employees e
  LEFT JOIN public.positions p ON p.name = e.position
  WHERE e.id = _employee_id;
$$;