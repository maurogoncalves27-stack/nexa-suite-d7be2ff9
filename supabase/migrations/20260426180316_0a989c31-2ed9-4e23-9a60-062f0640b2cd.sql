-- Tabela para a Central de Ocorrências (importada da planilha "OCORRÊNCIAS E SOLUÇÕES")
CREATE TABLE public.occurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  category TEXT,
  occurrence TEXT NOT NULL,
  order_correct BOOLEAN NOT NULL DEFAULT true, -- true = pedido correto (CC*), false = incorreto (CI*)
  platform TEXT NOT NULL DEFAULT 'IFOOD',
  action TEXT,
  message TEXT,
  prevention_1 TEXT,
  prevention_2 TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_occurrences_code ON public.occurrences(code);
CREATE INDEX idx_occurrences_category ON public.occurrences(category);

ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

-- Apenas gestores e admins podem ver/gerenciar
CREATE POLICY "Staff can view occurrences"
ON public.occurrences FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can insert occurrences"
ON public.occurrences FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update occurrences"
ON public.occurrences FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete occurrences"
ON public.occurrences FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_occurrences_updated_at
BEFORE UPDATE ON public.occurrences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();