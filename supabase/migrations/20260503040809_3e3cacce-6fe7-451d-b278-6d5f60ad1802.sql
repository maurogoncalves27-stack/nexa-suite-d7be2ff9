
-- Caixinha (petty cash) por loja física
-- Tabela 1: contas/saldos por loja
CREATE TABLE public.petty_cash_accounts (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_petty_cash_accounts_updated
BEFORE UPDATE ON public.petty_cash_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela 2: movimentações
CREATE TABLE public.petty_cash_movements (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('entrada','saida','ajuste')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  receipt_url text,
  receipt_number text,
  supplier_name text,
  source text, -- 'pix','dinheiro','transferencia','outro'
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pcm_account ON public.petty_cash_movements(account_id);
CREATE INDEX idx_pcm_store_date ON public.petty_cash_movements(store_id, occurred_at DESC);

-- Trigger: atualiza saldo
CREATE OR REPLACE FUNCTION public.apply_petty_cash_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.petty_cash_accounts
       SET balance = balance + CASE
                                  WHEN NEW.movement_type = 'entrada' THEN NEW.amount
                                  WHEN NEW.movement_type = 'saida'   THEN -NEW.amount
                                  WHEN NEW.movement_type = 'ajuste'  THEN NEW.amount
                                END,
           updated_at = now()
     WHERE id = NEW.account_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.petty_cash_accounts
       SET balance = balance - CASE
                                  WHEN OLD.movement_type = 'entrada' THEN OLD.amount
                                  WHEN OLD.movement_type = 'saida'   THEN -OLD.amount
                                  WHEN OLD.movement_type = 'ajuste'  THEN OLD.amount
                                END,
           updated_at = now()
     WHERE id = OLD.account_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_apply_petty_cash_movement
AFTER INSERT OR DELETE ON public.petty_cash_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_petty_cash_movement();

-- Auto-criar conta da loja física quando inserida
CREATE OR REPLACE FUNCTION public.ensure_petty_cash_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_virtual = false THEN
    INSERT INTO public.petty_cash_accounts(store_id)
    VALUES (NEW.id)
    ON CONFLICT (store_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_petty_cash_on_store_insert
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.ensure_petty_cash_account();

-- Backfill: criar conta para todas as lojas físicas existentes
INSERT INTO public.petty_cash_accounts(store_id)
SELECT id FROM public.stores
WHERE COALESCE(is_virtual, false) = false
ON CONFLICT (store_id) DO NOTHING;

-- RLS
ALTER TABLE public.petty_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with store access view petty cash"
  ON public.petty_cash_accounts FOR SELECT TO authenticated
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Admins/managers manage petty cash accounts"
  ON public.petty_cash_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Users with store access view petty cash movements"
  ON public.petty_cash_movements FOR SELECT TO authenticated
  USING (public.user_can_access_store(auth.uid(), store_id));

CREATE POLICY "Users with store access insert petty cash movements"
  ON public.petty_cash_movements FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_store(auth.uid(), store_id) AND created_by = auth.uid());

CREATE POLICY "Admins/managers delete petty cash movements"
  ON public.petty_cash_movements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- Storage bucket para cupons
INSERT INTO storage.buckets (id, name, public)
VALUES ('petty-cash-receipts', 'petty-cash-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated reads petty cash receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'petty-cash-receipts');

CREATE POLICY "Authenticated uploads petty cash receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'petty-cash-receipts');

CREATE POLICY "Authenticated deletes own petty cash receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'petty-cash-receipts' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)));
