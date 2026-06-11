
-- Vínculo loja física × item de cardápio (permite que cada loja tenha seu próprio conjunto de itens)
CREATE TABLE public.menu_item_stores (
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_stores TO authenticated;
GRANT ALL ON public.menu_item_stores TO service_role;

ALTER TABLE public.menu_item_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_item_stores_select_authenticated"
  ON public.menu_item_stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "menu_item_stores_manage_authenticated"
  ON public.menu_item_stores FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_menu_item_stores_store ON public.menu_item_stores(store_id);

-- Backfill: todos os itens existentes ficam disponíveis nas 4 lojas operacionais
INSERT INTO public.menu_item_stores (menu_item_id, store_id, is_available)
SELECT mi.id, s.id, true
FROM public.menu_items mi
CROSS JOIN public.stores s
WHERE s.name IN ('ASA SUL','ASA NORTE','ÁGUAS CLARAS','LAGO SUL')
ON CONFLICT DO NOTHING;
