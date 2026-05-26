-- Tabela de alertas de ocorrências disparados por colaboradores
CREATE TABLE public.occurrence_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurrence_id UUID NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | seen | resolved
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_occurrence_alerts_occurrence ON public.occurrence_alerts(occurrence_id);
CREATE INDEX idx_occurrence_alerts_created_by ON public.occurrence_alerts(created_by);
CREATE INDEX idx_occurrence_alerts_created_at ON public.occurrence_alerts(created_at DESC);
CREATE INDEX idx_occurrence_alerts_status ON public.occurrence_alerts(status);

ALTER TABLE public.occurrence_alerts ENABLE ROW LEVEL SECURITY;

-- Colaborador pode criar para si mesmo
CREATE POLICY "Users can create their own occurrence alerts"
ON public.occurrence_alerts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Usuário vê os próprios; gestor/admin veem todos
CREATE POLICY "Users can view their own alerts; managers see all"
ON public.occurrence_alerts
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Apenas gestor/admin atualizam
CREATE POLICY "Managers can update alerts"
ON public.occurrence_alerts
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Apenas gestor/admin removem
CREATE POLICY "Managers can delete alerts"
ON public.occurrence_alerts
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Trigger updated_at
CREATE TRIGGER update_occurrence_alerts_updated_at
BEFORE UPDATE ON public.occurrence_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();