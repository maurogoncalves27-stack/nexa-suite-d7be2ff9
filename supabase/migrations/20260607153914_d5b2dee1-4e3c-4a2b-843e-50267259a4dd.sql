
-- Runs
CREATE TABLE public.pdv_tef_homologation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pdc_code text,
  host_url text,
  acquirer text,
  integration_type text NOT NULL DEFAULT 'Biblioteca Windows',
  lib_version text,
  operator_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_tef_homologation_runs TO authenticated;
GRANT ALL ON public.pdv_tef_homologation_runs TO service_role;

ALTER TABLE public.pdv_tef_homologation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read homolog runs"
  ON public.pdv_tef_homologation_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage homolog runs"
  ON public.pdv_tef_homologation_runs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Steps
CREATE TABLE public.pdv_tef_homologation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pdv_tef_homologation_runs(id) ON DELETE CASCADE,
  step_number int NOT NULL CHECK (step_number BETWEEN 1 AND 60),
  step_name text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ok','fail','skipped','na')),
  nsu text,
  requnum text,
  authorization_code text,
  card_brand text,
  amount numeric(12,2),
  raw_response jsonb,
  observations text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_tef_homologation_steps TO authenticated;
GRANT ALL ON public.pdv_tef_homologation_steps TO service_role;

ALTER TABLE public.pdv_tef_homologation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read homolog steps"
  ON public.pdv_tef_homologation_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage homolog steps"
  ON public.pdv_tef_homologation_steps FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_pdv_tef_homolog_steps_run ON public.pdv_tef_homologation_steps(run_id, step_number);

-- updated_at triggers
CREATE TRIGGER trg_pdv_tef_homolog_runs_updated
  BEFORE UPDATE ON public.pdv_tef_homologation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_pdv_tef_homolog_steps_updated
  BEFORE UPDATE ON public.pdv_tef_homologation_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
