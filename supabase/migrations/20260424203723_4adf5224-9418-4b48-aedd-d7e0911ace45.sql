-- 1. Remove tabela de disponibilidade do cardápio (e dependências)
DROP TRIGGER IF EXISTS trg_validate_menu_availability ON public.menu_availability;
DROP TRIGGER IF EXISTS trg_menu_availability_updated_at ON public.menu_availability;
DROP FUNCTION IF EXISTS public.validate_menu_availability() CASCADE;
DROP TABLE IF EXISTS public.menu_availability CASCADE;

-- 2. Remove coluna de ordem manual de itens
DROP INDEX IF EXISTS public.inventory_products_category_menu_sort_idx;
ALTER TABLE public.inventory_products DROP COLUMN IF EXISTS menu_sort_order;

-- 3. Remove apenas as policies de fotos do cardápio
DROP POLICY IF EXISTS "Menu photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload menu photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update menu photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete menu photos" ON storage.objects;