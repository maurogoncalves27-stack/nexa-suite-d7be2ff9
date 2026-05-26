CREATE TABLE public.user_tour_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_key TEXT NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, tour_key)
);

ALTER TABLE public.user_tour_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tour progress"
ON public.user_tour_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own tour progress"
ON public.user_tour_progress FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tour progress"
ON public.user_tour_progress FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own tour progress"
ON public.user_tour_progress FOR DELETE
TO authenticated
USING (auth.uid() = user_id);