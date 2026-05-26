-- Enum de status
DO $$ BEGIN
  CREATE TYPE public.shift_swap_status AS ENUM ('pending', 'accepted', 'rejected', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum de tipo
DO $$ BEGIN
  CREATE TYPE public.shift_swap_type AS ENUM ('reciprocal', 'coverage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL,
  partner_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  partner_user_id uuid,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  swap_type public.shift_swap_type NOT NULL DEFAULT 'reciprocal',
  requester_date date NOT NULL,
  partner_date date,
  reason text,
  status public.shift_swap_status NOT NULL DEFAULT 'pending',
  partner_responded_at timestamptz,
  partner_response_note text,
  manager_decided_at timestamptz,
  manager_decided_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_swap_partner_date_required
    CHECK (swap_type = 'coverage' OR partner_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_shift_swap_requester ON public.shift_swap_requests(requester_user_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_swap_partner ON public.shift_swap_requests(partner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_swap_store_status ON public.shift_swap_requests(store_id, status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_shift_swap_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_swap_set_updated_at ON public.shift_swap_requests;
CREATE TRIGGER shift_swap_set_updated_at
BEFORE UPDATE ON public.shift_swap_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_shift_swap_updated_at();

-- RLS
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

-- Colaborador vê suas próprias solicitações (como solicitante ou convidado)
CREATE POLICY "Employees view own swap requests"
ON public.shift_swap_requests FOR SELECT
TO authenticated
USING (
  requester_user_id = auth.uid()
  OR partner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Colaborador cria como solicitante
CREATE POLICY "Employees create own swap requests"
ON public.shift_swap_requests FOR INSERT
TO authenticated
WITH CHECK (requester_user_id = auth.uid());

-- Colaborador atualiza (aceitar/recusar quando é convidado, cancelar quando é solicitante)
-- Gestor/admin atualiza para aprovar/rejeitar
CREATE POLICY "Update swap requests"
ON public.shift_swap_requests FOR UPDATE
TO authenticated
USING (
  requester_user_id = auth.uid()
  OR partner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  requester_user_id = auth.uid()
  OR partner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Solicitante pode deletar enquanto pendente; gestor/admin sempre
CREATE POLICY "Delete swap requests"
ON public.shift_swap_requests FOR DELETE
TO authenticated
USING (
  (requester_user_id = auth.uid() AND status IN ('pending', 'rejected'))
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Função que aplica a troca nas escalas (chamada após aprovação)
CREATE OR REPLACE FUNCTION public.apply_shift_swap(_swap_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap public.shift_swap_requests%ROWTYPE;
  v_req_row public.work_schedules%ROWTYPE;
  v_par_row public.work_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_swap FROM public.shift_swap_requests WHERE id = _swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_swap.status <> 'approved' THEN
    RAISE EXCEPTION 'A troca precisa estar aprovada para ser aplicada';
  END IF;

  -- Busca a escala do solicitante na data dele
  SELECT * INTO v_req_row
  FROM public.work_schedules
  WHERE employee_id = v_swap.requester_employee_id
    AND schedule_date = v_swap.requester_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escala do solicitante não encontrada na data %', v_swap.requester_date;
  END IF;

  IF v_swap.swap_type = 'reciprocal' THEN
    SELECT * INTO v_par_row
    FROM public.work_schedules
    WHERE employee_id = v_swap.partner_employee_id
      AND schedule_date = v_swap.partner_date;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Escala do colega não encontrada na data %', v_swap.partner_date;
    END IF;

    -- Inverte: o solicitante assume os horários do colega na data dele,
    -- e o colega assume os horários do solicitante na data dele.
    UPDATE public.work_schedules SET
      is_day_off    = v_par_row.is_day_off,
      is_home_office = v_par_row.is_home_office,
      start_time    = v_par_row.start_time,
      end_time      = v_par_row.end_time,
      break_start   = v_par_row.break_start,
      break_end     = v_par_row.break_end,
      break_start_2 = v_par_row.break_start_2,
      break_end_2   = v_par_row.break_end_2,
      notes         = COALESCE(notes, '') || ' [troca aprovada #' || _swap_id || ']'
    WHERE id = v_req_row.id;

    UPDATE public.work_schedules SET
      is_day_off    = v_req_row.is_day_off,
      is_home_office = v_req_row.is_home_office,
      start_time    = v_req_row.start_time,
      end_time      = v_req_row.end_time,
      break_start   = v_req_row.break_start,
      break_end     = v_req_row.break_end,
      break_start_2 = v_req_row.break_start_2,
      break_end_2   = v_req_row.break_end_2,
      notes         = COALESCE(notes, '') || ' [troca aprovada #' || _swap_id || ']'
    WHERE id = v_par_row.id;

  ELSE
    -- Cobertura: apenas inverte a flag de folga na data do solicitante
    -- (o solicitante folga; o colega cobre)
    -- Solicitante: vira folga
    UPDATE public.work_schedules SET
      is_day_off = true,
      start_time = NULL,
      end_time = NULL,
      break_start = NULL,
      break_end = NULL,
      break_start_2 = NULL,
      break_end_2 = NULL,
      notes = COALESCE(notes, '') || ' [coberto por colega - troca #' || _swap_id || ']'
    WHERE id = v_req_row.id;

    -- Colega: cria/atualiza escala na mesma data com os horários originais do solicitante
    INSERT INTO public.work_schedules (
      employee_id, store_id, schedule_date, is_day_off, is_home_office,
      start_time, end_time, break_start, break_end, break_start_2, break_end_2,
      notes, created_by
    ) VALUES (
      v_swap.partner_employee_id, v_swap.store_id, v_swap.requester_date, false, false,
      v_req_row.start_time, v_req_row.end_time, v_req_row.break_start, v_req_row.break_end,
      v_req_row.break_start_2, v_req_row.break_end_2,
      'Cobertura aprovada (troca #' || _swap_id || ')', v_swap.manager_decided_by
    )
    ON CONFLICT (employee_id, schedule_date) DO UPDATE SET
      is_day_off = false,
      is_home_office = false,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      break_start = EXCLUDED.break_start,
      break_end = EXCLUDED.break_end,
      break_start_2 = EXCLUDED.break_start_2,
      break_end_2 = EXCLUDED.break_end_2,
      notes = COALESCE(public.work_schedules.notes, '') || ' [cobertura - troca #' || _swap_id || ']';
  END IF;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_swap_requests;