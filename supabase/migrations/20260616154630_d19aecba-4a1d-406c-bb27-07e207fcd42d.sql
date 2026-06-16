
CREATE TABLE public.finance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('payable','receivable','bank_tx')),
  source_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  percent numeric(7,4),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id, store_id)
);

CREATE INDEX idx_finance_allocations_source ON public.finance_allocations (source_kind, source_id);
CREATE INDEX idx_finance_allocations_store ON public.finance_allocations (store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_allocations TO authenticated;
GRANT ALL ON public.finance_allocations TO service_role;

ALTER TABLE public.finance_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allocations follow source access"
  ON public.finance_allocations
  FOR ALL
  TO authenticated
  USING (
    CASE source_kind
      WHEN 'payable' THEN public.can_view_accounts_payable(auth.uid())
      ELSE
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'manager') OR
        public.has_role(auth.uid(), 'hr') OR
        public.has_role(auth.uid(), 'contabilidade')
    END
  )
  WITH CHECK (
    CASE source_kind
      WHEN 'payable' THEN public.can_view_accounts_payable(auth.uid())
      ELSE
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'manager') OR
        public.has_role(auth.uid(), 'hr') OR
        public.has_role(auth.uid(), 'contabilidade')
    END
  );

CREATE TRIGGER trg_finance_allocations_updated_at
  BEFORE UPDATE ON public.finance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_finance_allocation_sum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_source uuid;
  v_total numeric(14,2);
  v_expected numeric(14,2);
BEGIN
  v_kind   := COALESCE(NEW.source_kind, OLD.source_kind);
  v_source := COALESCE(NEW.source_id,   OLD.source_id);

  SELECT COALESCE(SUM(amount),0) INTO v_total
    FROM public.finance_allocations
   WHERE source_kind = v_kind AND source_id = v_source;

  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_kind = 'payable' THEN
    SELECT amount INTO v_expected FROM public.accounts_payable WHERE id = v_source;
  ELSIF v_kind = 'receivable' THEN
    SELECT amount INTO v_expected FROM public.accounts_receivable WHERE id = v_source;
  ELSIF v_kind = 'bank_tx' THEN
    SELECT ABS(amount) INTO v_expected FROM public.bank_transactions WHERE id = v_source;
  END IF;

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'Lançamento de origem não encontrado para rateio (% / %)', v_kind, v_source;
  END IF;

  IF ABS(v_total - v_expected) > 0.02 THEN
    RAISE EXCEPTION 'Soma do rateio (%) difere do valor do lançamento (%). Ajuste as fatias.',
      v_total, v_expected;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER trg_validate_finance_allocation_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_finance_allocation_sum();

CREATE OR REPLACE VIEW public.v_finance_allocations_effective
WITH (security_invoker=on) AS
SELECT 'payable'::text AS source_kind,
       ap.id           AS source_id,
       COALESCE(fa.store_id, ap.store_id) AS store_id,
       COALESCE(fa.amount,   ap.amount)   AS amount,
       ap.due_date                         AS reference_date,
       ap.category_id                      AS category_id,
       (fa.id IS NOT NULL)                 AS is_split
  FROM public.accounts_payable ap
  LEFT JOIN public.finance_allocations fa
         ON fa.source_kind = 'payable' AND fa.source_id = ap.id
UNION ALL
SELECT 'receivable'::text,
       ar.id,
       COALESCE(fa.store_id, ar.store_id),
       COALESCE(fa.amount,   ar.amount),
       ar.due_date,
       NULL::uuid,
       (fa.id IS NOT NULL)
  FROM public.accounts_receivable ar
  LEFT JOIN public.finance_allocations fa
         ON fa.source_kind = 'receivable' AND fa.source_id = ar.id
UNION ALL
SELECT 'bank_tx'::text,
       bt.id,
       fa.store_id,
       fa.amount,
       bt.posted_at,
       NULL::uuid,
       true
  FROM public.bank_transactions bt
  JOIN public.finance_allocations fa
       ON fa.source_kind = 'bank_tx' AND fa.source_id = bt.id;

GRANT SELECT ON public.v_finance_allocations_effective TO authenticated, service_role;

COMMENT ON TABLE public.finance_allocations IS
  'Rateio de despesas/receitas/movimentos bancários entre lojas (centro de custo = loja).';
COMMENT ON VIEW public.v_finance_allocations_effective IS
  'Rateio efetivo por loja: usa finance_allocations quando existir, senão cai no store_id único do lançamento.';
