ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['totem','site','pdv','garcom','ifood']::text[],
  ADD COLUMN IF NOT EXISTS fulfillment text[] NOT NULL DEFAULT ARRAY['delivery','pickup']::text[];

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS is_yolo_exclusive boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.menu_category_store_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  start_time time NOT NULL DEFAULT '00:00',
  end_time time NOT NULL DEFAULT '23:59',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_category_store_windows_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT menu_category_store_windows_unique UNIQUE (category_id, store_id, weekday, start_time, end_time)
);

GRANT SELECT ON public.menu_category_store_windows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_category_store_windows TO authenticated;
GRANT ALL ON public.menu_category_store_windows TO service_role;

ALTER TABLE public.menu_category_store_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcsw_select_public" ON public.menu_category_store_windows
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "mcsw_write_admin_manager" ON public.menu_category_store_windows
  FOR ALL TO authenticated
  USING (public.is_super_user((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role))
  WITH CHECK (public.is_super_user((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role));

CREATE INDEX IF NOT EXISTS idx_mcsw_category_store ON public.menu_category_store_windows (category_id, store_id);

CREATE TRIGGER update_menu_category_store_windows_updated_at
  BEFORE UPDATE ON public.menu_category_store_windows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();