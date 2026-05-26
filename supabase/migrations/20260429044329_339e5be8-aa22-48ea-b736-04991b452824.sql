-- ========================================
-- BANCO DE HORAS
-- ========================================

CREATE TYPE public.hour_bank_entry_type AS ENUM (
  'overtime',         -- crédito: hora extra (positivo)
  'late',             -- débito: atraso (negativo)
  'early_leave',      -- débito: saída antecipada (negativo)
  'manual_credit',    -- crédito manual (positivo)
  'manual_debit',     -- débito manual (negativo)
  'expired',          -- débito automático: crédito venceu (negativo)
  'payout'            -- débito: pago em folha (negativo)
);

CREATE TABLE public.hour_bank_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_date date NOT NULL,
  entry_type public.hour_bank_entry_type NOT NULL,
  minutes integer NOT NULL,                  -- + crédito, - débito
  minutes_remaining integer NOT NULL DEFAULT 0, -- só para créditos: ainda não consumido
  expires_at date,                            -- só para créditos: 6 meses após reference_date
  source_kind text,                           -- 'auto_schedule_vs_punch' | 'manual' | 'expiration' | 'payout'
  source_id uuid,                             -- referência opcional (ex.: time_clock_entry/justification)
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minutes_nonzero CHECK (minutes <> 0),
  CONSTRAINT remaining_nonneg CHECK (minutes_remaining >= 0),
  CONSTRAINT credit_has_expiry CHECK (
    (minutes > 0 AND expires_at IS NOT NULL) OR (minutes < 0)
  )
);

CREATE INDEX idx_hbe_employee_date ON public.hour_bank_entries(employee_id, reference_date DESC);
CREATE INDEX idx_hbe_credits_open ON public.hour_bank_entries(employee_id, expires_at)
  WHERE minutes > 0 AND minutes_remaining > 0;
CREATE UNIQUE INDEX uq_hbe_auto_per_day ON public.hour_bank_entries(employee_id, reference_date, entry_type)
  WHERE source_kind = 'auto_schedule_vs_punch';

CREATE TRIGGER trg_hbe_updated_at
  BEFORE UPDATE ON public.hour_bank_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.hour_bank_entries ENABLE ROW LEVEL SECURITY;

-- Colaborador vê o próprio
CREATE POLICY "Funcionário vê o próprio banco"
  ON public.hour_bank_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = hour_bank_entries.employee_id AND e.user_id = auth.uid()
    )
  );

-- Admin/super vê tudo
CREATE POLICY "Admin vê tudo"
  ON public.hour_bank_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- Apenas admin/super pode inserir/atualizar/deletar
CREATE POLICY "Admin gerencia banco"
  ON public.hour_bank_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));

-- ========================================
-- FUNÇÕES
-- ========================================

-- Aplica débito consumindo créditos por FIFO (mais antigos primeiro)
CREATE OR REPLACE FUNCTION public.hour_bank_apply_debit(
  p_employee_id uuid,
  p_minutes integer,    -- valor POSITIVO em minutos a debitar
  p_reference_date date,
  p_entry_type public.hour_bank_entry_type,
  p_source_kind text,
  p_source_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer := p_minutes;
  v_credit RECORD;
  v_take integer;
  v_entry_id uuid;
BEGIN
  IF p_minutes <= 0 THEN
    RAISE EXCEPTION 'p_minutes deve ser positivo';
  END IF;

  -- Consome créditos abertos por FIFO (mais antigos primeiro), respeitando vencimento >= reference_date
  FOR v_credit IN
    SELECT id, minutes_remaining
    FROM public.hour_bank_entries
    WHERE employee_id = p_employee_id
      AND minutes > 0
      AND minutes_remaining > 0
      AND expires_at >= p_reference_date
    ORDER BY reference_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_credit.minutes_remaining, v_remaining);
    UPDATE public.hour_bank_entries
       SET minutes_remaining = minutes_remaining - v_take
     WHERE id = v_credit.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  -- Registra o débito (mesmo se não houver créditos suficientes — vira saldo negativo)
  INSERT INTO public.hour_bank_entries
    (employee_id, reference_date, entry_type, minutes, minutes_remaining,
     expires_at, source_kind, source_id, notes, created_by)
  VALUES
    (p_employee_id, p_reference_date, p_entry_type, -p_minutes, 0,
     NULL, p_source_kind, p_source_id, p_notes, p_created_by)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

-- Registra crédito de hora extra
CREATE OR REPLACE FUNCTION public.hour_bank_register_credit(
  p_employee_id uuid,
  p_minutes integer,
  p_reference_date date,
  p_entry_type public.hour_bank_entry_type,
  p_source_kind text,
  p_source_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  IF p_minutes <= 0 THEN
    RAISE EXCEPTION 'p_minutes deve ser positivo';
  END IF;

  INSERT INTO public.hour_bank_entries
    (employee_id, reference_date, entry_type, minutes, minutes_remaining,
     expires_at, source_kind, source_id, notes, created_by)
  VALUES
    (p_employee_id, p_reference_date, p_entry_type, p_minutes, p_minutes,
     p_reference_date + INTERVAL '6 months', p_source_kind, p_source_id, p_notes, p_created_by)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

-- Expira créditos vencidos (chamada periódica)
CREATE OR REPLACE FUNCTION public.hour_bank_expire_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit RECORD;
  v_count integer := 0;
BEGIN
  FOR v_credit IN
    SELECT id, employee_id, minutes_remaining, expires_at
    FROM public.hour_bank_entries
    WHERE minutes > 0
      AND minutes_remaining > 0
      AND expires_at < CURRENT_DATE
    FOR UPDATE
  LOOP
    INSERT INTO public.hour_bank_entries
      (employee_id, reference_date, entry_type, minutes, minutes_remaining,
       expires_at, source_kind, source_id, notes)
    VALUES
      (v_credit.employee_id, CURRENT_DATE, 'expired',
       -v_credit.minutes_remaining, 0, NULL, 'expiration', v_credit.id,
       'Crédito vencido (6 meses) — expirado em ' || v_credit.expires_at::text);

    UPDATE public.hour_bank_entries
       SET minutes_remaining = 0
     WHERE id = v_credit.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- View de saldo por colaborador
CREATE OR REPLACE VIEW public.hour_bank_balances AS
SELECT
  employee_id,
  COALESCE(SUM(minutes) FILTER (WHERE minutes > 0), 0) AS total_credit_minutes,
  COALESCE(SUM(-minutes) FILTER (WHERE minutes < 0), 0) AS total_debit_minutes,
  COALESCE(SUM(minutes_remaining) FILTER (WHERE minutes > 0), 0) AS available_minutes,
  COALESCE(SUM(minutes), 0) AS net_minutes,
  COUNT(*) FILTER (WHERE minutes > 0 AND minutes_remaining > 0 AND expires_at <= CURRENT_DATE + INTERVAL '30 days') AS credits_expiring_soon
FROM public.hour_bank_entries
GROUP BY employee_id;