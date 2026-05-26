-- Criar tabela de freelancers
CREATE TABLE public.freelancers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  cpf TEXT,
  address TEXT,
  phone TEXT,
  pix_key TEXT,
  pix_key_type TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.freelancers ENABLE ROW LEVEL SECURITY;

-- Apenas admin (RH) e manager (Gerente) podem gerenciar
CREATE POLICY "Staff can view freelancers"
  ON public.freelancers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can insert freelancers"
  ON public.freelancers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update freelancers"
  ON public.freelancers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can delete freelancers"
  ON public.freelancers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Trigger updated_at
CREATE TRIGGER update_freelancers_updated_at
  BEFORE UPDATE ON public.freelancers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Desativar o cargo "Freelancer" da lista de cargos (já que freelancers terão tabela própria)
UPDATE public.positions SET is_active = false WHERE name = 'Freelancer';