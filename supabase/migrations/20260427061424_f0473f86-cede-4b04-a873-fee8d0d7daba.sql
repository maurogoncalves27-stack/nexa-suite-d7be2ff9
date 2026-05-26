CREATE TABLE public.candidate_message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.job_candidates(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  to_phone TEXT,
  status TEXT NOT NULL,
  message_body TEXT,
  provider_response JSONB,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'auto',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_message_logs_candidate ON public.candidate_message_logs(candidate_id);
CREATE INDEX idx_candidate_message_logs_created ON public.candidate_message_logs(created_at DESC);

ALTER TABLE public.candidate_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view message logs"
ON public.candidate_message_logs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service can insert message logs"
ON public.candidate_message_logs
FOR INSERT
TO authenticated
WITH CHECK (true);