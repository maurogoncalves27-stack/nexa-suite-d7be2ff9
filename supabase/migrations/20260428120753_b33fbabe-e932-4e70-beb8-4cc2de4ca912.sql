-- Add position_id FK to position_bonuses
ALTER TABLE public.position_bonuses
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE;

-- Backfill from existing position name (matching positions.name OR positions.cbo_title)
UPDATE public.position_bonuses pb
SET position_id = p.id
FROM public.positions p
WHERE pb.position_id IS NULL
  AND (
    lower(trim(p.name)) = lower(trim(pb.position))
    OR lower(trim(p.cbo_title)) = lower(trim(pb.position))
  );

-- Remove any orphan bonuses (no matching position)
DELETE FROM public.position_bonuses WHERE position_id IS NULL;

-- Make NOT NULL + UNIQUE
ALTER TABLE public.position_bonuses
  ALTER COLUMN position_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS position_bonuses_position_id_key
  ON public.position_bonuses(position_id);