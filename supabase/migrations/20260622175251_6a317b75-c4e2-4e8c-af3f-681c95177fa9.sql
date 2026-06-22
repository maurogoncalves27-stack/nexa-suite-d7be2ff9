-- GRANTs para anon nas tabelas do cardápio
GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT ON public.menu_item_brands TO anon;
GRANT SELECT ON public.brands TO anon;
GRANT SELECT ON public.menu_item_stores TO anon;
GRANT SELECT ON public.recipes TO anon;

-- Policies para anon ler o cardápio
CREATE POLICY "Anon can read active menu items" ON public.menu_items
  FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Anon can read menu categories" ON public.menu_categories
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read menu item brands" ON public.menu_item_brands
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read brands" ON public.brands
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read available menu item stores" ON public.menu_item_stores
  FOR SELECT TO anon USING (is_available = true);

CREATE POLICY "Anon can read recipes" ON public.recipes
  FOR SELECT TO anon USING (true);
