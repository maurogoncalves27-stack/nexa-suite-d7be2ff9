CREATE TABLE public.hr_announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.hr_announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, announcement_id)
);
GRANT SELECT, INSERT, DELETE ON public.hr_announcement_dismissals TO authenticated;
GRANT ALL ON public.hr_announcement_dismissals TO service_role;
ALTER TABLE public.hr_announcement_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own dismissals" ON public.hr_announcement_dismissals FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_hr_announcement_dismissals_user ON public.hr_announcement_dismissals(user_id);