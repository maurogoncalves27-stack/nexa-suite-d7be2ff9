ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS night_shift_eligible boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'national' CHECK (scope IN ('national','state','municipal','store')),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(holiday_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date_global ON public.holidays(holiday_date) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date_store ON public.holidays(holiday_date, store_id) WHERE store_id IS NOT NULL;

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holidays viewable by authenticated"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Holidays managed by admins/managers"
  ON public.holidays FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_holidays_updated
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.holidays (holiday_date, name, scope) VALUES
  ('2026-01-01', 'Confraternização Universal', 'national'),
  ('2026-02-16', 'Carnaval (segunda)', 'national'),
  ('2026-02-17', 'Carnaval (terça)', 'national'),
  ('2026-04-03', 'Sexta-feira Santa', 'national'),
  ('2026-04-21', 'Tiradentes', 'national'),
  ('2026-05-01', 'Dia do Trabalho', 'national'),
  ('2026-06-04', 'Corpus Christi', 'national'),
  ('2026-09-07', 'Independência do Brasil', 'national'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'national'),
  ('2026-11-02', 'Finados', 'national'),
  ('2026-11-15', 'Proclamação da República', 'national'),
  ('2026-11-20', 'Consciência Negra', 'national'),
  ('2026-12-25', 'Natal', 'national')
ON CONFLICT DO NOTHING;