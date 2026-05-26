-- Tabela de bônus por cargo
CREATE TABLE public.position_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position TEXT NOT NULL UNIQUE,
  bonus_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.position_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view position bonuses"
ON public.position_bonuses
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin manage position bonuses"
ON public.position_bonuses
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_position_bonuses_updated_at
BEFORE UPDATE ON public.position_bonuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();