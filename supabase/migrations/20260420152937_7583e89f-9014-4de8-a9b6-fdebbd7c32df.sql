ALTER TABLE public.employee_infractions
  ADD CONSTRAINT employee_infractions_infraction_type_id_fkey
  FOREIGN KEY (infraction_type_id) REFERENCES public.infraction_types(id) ON DELETE RESTRICT;

ALTER TABLE public.employee_infractions
  ADD CONSTRAINT employee_infractions_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.employee_infractions
  ADD CONSTRAINT employee_infractions_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES public.evaluation_cycles(id) ON DELETE SET NULL;