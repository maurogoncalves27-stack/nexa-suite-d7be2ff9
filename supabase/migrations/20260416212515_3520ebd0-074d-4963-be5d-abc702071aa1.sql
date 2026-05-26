ALTER TABLE public.evaluation_cycles
ADD COLUMN IF NOT EXISTS periodicity text NOT NULL DEFAULT 'weekly';

ALTER TABLE public.evaluation_cycles
DROP CONSTRAINT IF EXISTS evaluation_cycles_periodicity_check;

ALTER TABLE public.evaluation_cycles
ADD CONSTRAINT evaluation_cycles_periodicity_check
CHECK (periodicity IN ('weekly','monthly','semiannual'));