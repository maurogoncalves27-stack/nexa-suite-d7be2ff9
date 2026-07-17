
ALTER TABLE public.medical_certificates
  ADD CONSTRAINT medical_certificates_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
