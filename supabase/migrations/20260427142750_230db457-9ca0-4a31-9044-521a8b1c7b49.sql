ALTER TABLE public.job_applications DROP CONSTRAINT IF EXISTS job_applications_selected_slot_id_fkey;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_selected_slot_id_fkey
  FOREIGN KEY (selected_slot_id) REFERENCES public.interview_slots(id) ON DELETE SET NULL;