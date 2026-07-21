ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS current_level TEXT DEFAULT 'I';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS level_updated_at TIMESTAMPTZ;
ALTER TABLE public.promotion_criteria DROP CONSTRAINT IF EXISTS promotion_criteria_promotion_type_check;
ALTER TABLE public.promotion_criteria ADD CONSTRAINT promotion_criteria_promotion_type_check CHECK (promotion_type IN ('horizontal','vertical','level'));