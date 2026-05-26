-- Remoção do módulo Plano de Carreira
-- Apaga em ordem para respeitar FKs (employee_career → career_levels → career_tracks)

DROP TABLE IF EXISTS public.employee_career CASCADE;
DROP TABLE IF EXISTS public.career_levels CASCADE;
DROP TABLE IF EXISTS public.career_tracks CASCADE;