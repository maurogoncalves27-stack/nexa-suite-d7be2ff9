GRANT SELECT ON public.complement_groups TO anon;
GRANT SELECT ON public.complement_options TO anon;
GRANT SELECT ON public.menu_item_complement_links TO anon;
GRANT SELECT ON public.menu_item_complement_groups TO anon;
GRANT SELECT ON public.menu_item_complement_options TO anon;

CREATE POLICY "Anon can read complement groups" ON public.complement_groups FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read complement options" ON public.complement_options FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read menu item complement links" ON public.menu_item_complement_links FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read menu item complement groups" ON public.menu_item_complement_groups FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read menu item complement options" ON public.menu_item_complement_options FOR SELECT TO anon USING (true);