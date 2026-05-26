-- Tabela de disponibilidade de itens/categorias do cardápio por loja
-- Permite pausar manualmente OU programar uma janela de aparição (data/hora início e fim)
CREATE TABLE public.menu_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  -- Alvo: produto OU categoria (exatamente um dos dois)
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  category TEXT,
  -- Estado manual: se true, o item está pausado/oculto agora
  is_paused BOOLEAN NOT NULL DEFAULT false,
  -- Janela de agendamento (opcional). Se preenchido, o item só aparece dentro da janela.
  -- available_from: a partir de quando o item aparece (NULL = já disponível)
  -- available_until: até quando o item aparece (NULL = sem fim)
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  -- Garantia: ou produto ou categoria, nunca os dois nem nenhum
  CONSTRAINT menu_availability_target_check
    CHECK ((product_id IS NOT NULL AND category IS NULL) OR (product_id IS NULL AND category IS NOT NULL))
);

-- Índices únicos: 1 registro por (loja, produto) e 1 por (loja, categoria)
CREATE UNIQUE INDEX menu_availability_store_product_uidx
  ON public.menu_availability(store_id, product_id)
  WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX menu_availability_store_category_uidx
  ON public.menu_availability(store_id, category)
  WHERE category IS NOT NULL;

CREATE INDEX menu_availability_store_idx ON public.menu_availability(store_id);

-- Validação por trigger (em vez de CHECK com now()) para janela coerente
CREATE OR REPLACE FUNCTION public.validate_menu_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.available_from IS NOT NULL AND NEW.available_until IS NOT NULL
     AND NEW.available_until <= NEW.available_from THEN
    RAISE EXCEPTION 'available_until deve ser posterior a available_from';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_menu_availability
BEFORE INSERT OR UPDATE ON public.menu_availability
FOR EACH ROW EXECUTE FUNCTION public.validate_menu_availability();

CREATE TRIGGER trg_menu_availability_updated_at
BEFORE UPDATE ON public.menu_availability
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.menu_availability ENABLE ROW LEVEL SECURITY;

-- Leitura: usuários com acesso à loja podem ver
CREATE POLICY "menu_availability_select_store_access"
ON public.menu_availability FOR SELECT
TO authenticated
USING (public.user_can_access_store(auth.uid(), store_id));

-- Escrita: admin/manager com acesso à loja
CREATE POLICY "menu_availability_insert_admin_manager"
ON public.menu_availability FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  AND public.user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "menu_availability_update_admin_manager"
ON public.menu_availability FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  AND public.user_can_access_store(auth.uid(), store_id)
);

CREATE POLICY "menu_availability_delete_admin_manager"
ON public.menu_availability FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  AND public.user_can_access_store(auth.uid(), store_id)
);

-- Função utilitária: dado (store, product, category), retorna se está disponível agora
CREATE OR REPLACE FUNCTION public.menu_item_available(
  _store_id UUID,
  _product_id UUID,
  _category TEXT,
  _ref TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH rules AS (
    SELECT is_paused, available_from, available_until
      FROM public.menu_availability
     WHERE store_id = _store_id
       AND ((product_id = _product_id AND _product_id IS NOT NULL)
         OR (category = _category AND _category IS NOT NULL))
  )
  SELECT NOT EXISTS (
    SELECT 1 FROM rules
     WHERE is_paused = true
        OR (available_from IS NOT NULL AND _ref < available_from)
        OR (available_until IS NOT NULL AND _ref > available_until)
  );
$$;