-- Tabela de responsabilidades por cargo
CREATE TABLE public.position_responsibilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position TEXT NOT NULL,
  responsibility TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_position_responsibilities_position ON public.position_responsibilities(position);

ALTER TABLE public.position_responsibilities ENABLE ROW LEVEL SECURITY;

-- Admin/manager gerenciam
CREATE POLICY "Admin/manager manage position responsibilities"
  ON public.position_responsibilities
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Colaborador vê responsabilidades do seu próprio cargo
CREATE POLICY "Employees view own position responsibilities"
  ON public.position_responsibilities
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.position = position_responsibilities.position
    )
  );

-- Trigger updated_at
CREATE TRIGGER update_position_responsibilities_updated_at
  BEFORE UPDATE ON public.position_responsibilities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();