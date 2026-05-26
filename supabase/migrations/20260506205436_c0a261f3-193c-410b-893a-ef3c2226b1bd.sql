CREATE OR REPLACE FUNCTION public.auto_terminate_internship_on_employee_termination()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'terminated' AND (OLD.status IS DISTINCT FROM 'terminated') THEN
    UPDATE public.internships
       SET status = 'terminated',
           end_date = LEAST(end_date, CURRENT_DATE)
     WHERE employee_id = NEW.id
       AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_terminate_internship ON public.employees;
CREATE TRIGGER trg_auto_terminate_internship
AFTER UPDATE OF status ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.auto_terminate_internship_on_employee_termination();