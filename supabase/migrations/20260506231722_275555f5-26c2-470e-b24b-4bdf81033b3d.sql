CREATE TABLE public.interview_reschedule_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  previous_slot_id UUID REFERENCES public.interview_slots(id) ON DELETE SET NULL,
  new_slot_id UUID REFERENCES public.interview_slots(id) ON DELETE SET NULL,
  reason TEXT,
  rescheduled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_reschedule_log_application ON public.interview_reschedule_log(application_id);

ALTER TABLE public.interview_reschedule_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view reschedule log"
ON public.interview_reschedule_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff can insert reschedule log"
ON public.interview_reschedule_log FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));