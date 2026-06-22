
CREATE TABLE public.chat_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  scenario text NOT NULL,
  session_id text NOT NULL,
  persona jsonb,
  passed boolean,
  score numeric,
  issues jsonb,
  evaluator_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_test_runs_run_id_idx ON public.chat_test_runs (run_id);
CREATE INDEX chat_test_runs_created_at_idx ON public.chat_test_runs (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_test_runs TO authenticated;
GRANT ALL ON public.chat_test_runs TO service_role;

ALTER TABLE public.chat_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_runs_super_user_all" ON public.chat_test_runs
  FOR ALL TO authenticated
  USING (public.is_super_user(auth.uid()))
  WITH CHECK (public.is_super_user(auth.uid()));
