ALTER TABLE public.infraction_types
  ADD COLUMN IF NOT EXISTS default_suspension_weeks integer NOT NULL DEFAULT 0;

-- Migra a regra anterior: tipos cujo nome contém "falta" recebem 2 semanas por padrão
UPDATE public.infraction_types
   SET default_suspension_weeks = 2
 WHERE default_suspension_weeks = 0
   AND lower(name) LIKE '%falta%';