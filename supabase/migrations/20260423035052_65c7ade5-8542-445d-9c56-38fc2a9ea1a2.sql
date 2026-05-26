-- Adiciona ordem aos produtos do cardápio
ALTER TABLE public.inventory_products 
ADD COLUMN IF NOT EXISTS menu_sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inventory_products_menu_sort 
ON public.inventory_products(category, menu_sort_order);

-- Tabela para guardar a ordem das categorias do cardápio
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- Apenas usuários autenticados podem visualizar e gerenciar
CREATE POLICY "Authenticated can view menu categories"
ON public.menu_categories FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins/managers can insert menu categories"
ON public.menu_categories FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Admins/managers can update menu categories"
ON public.menu_categories FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Admins/managers can delete menu categories"
ON public.menu_categories FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- Trigger updated_at
CREATE TRIGGER trg_menu_categories_updated_at
BEFORE UPDATE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Popula menu_categories com as categorias existentes em ordem alfabética
INSERT INTO public.menu_categories (name, sort_order)
SELECT DISTINCT category, ROW_NUMBER() OVER (ORDER BY category) * 10
FROM public.inventory_products
WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (name) DO NOTHING;