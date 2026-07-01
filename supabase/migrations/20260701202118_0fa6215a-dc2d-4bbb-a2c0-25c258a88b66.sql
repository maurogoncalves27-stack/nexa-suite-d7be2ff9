
ALTER TABLE public.nutri_visit_reports ADD COLUMN IF NOT EXISTS nutritionist_rating numeric(2,1);
DROP TABLE IF EXISTS public.manual_platform_ratings CASCADE;
