-- Tabela de solicitações de manutenção (precisa de aprovação antes do registro)
CREATE TABLE public.nutri_maintenance_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  equipment_type TEXT NOT NULL,
  description TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'media' CHECK (urgency IN ('baixa','media','alta')),
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  maintenance_record_id UUID REFERENCES public.nutri_maintenance_records(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nmr_store_status ON public.nutri_maintenance_requests(store_id, status);

ALTER TABLE public.nutri_maintenance_requests ENABLE ROW LEVEL SECURITY;

-- Visualizar: usuários com acesso à loja
CREATE POLICY "View maintenance requests for accessible stores"
  ON public.nutri_maintenance_requests FOR SELECT
  USING (public.user_can_access_store(auth.uid(), store_id));

-- Inserir: qualquer usuário autenticado da loja
CREATE POLICY "Insert maintenance requests for accessible stores"
  ON public.nutri_maintenance_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.user_can_access_store(auth.uid(), store_id));

-- Atualizar: usuários com acesso à loja (para aprovar/rejeitar/completar)
CREATE POLICY "Update maintenance requests for accessible stores"
  ON public.nutri_maintenance_requests FOR UPDATE
  USING (public.user_can_access_store(auth.uid(), store_id));

-- Deletar: criador ou admin
CREATE POLICY "Delete own maintenance requests"
  ON public.nutri_maintenance_requests FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_nmr_updated_at
  BEFORE UPDATE ON public.nutri_maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket para fotos das solicitações
INSERT INTO storage.buckets (id, name, public)
  VALUES ('nutri-maintenance-photos', 'nutri-maintenance-photos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read maintenance photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'nutri-maintenance-photos');

CREATE POLICY "Authenticated upload maintenance photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'nutri-maintenance-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated delete maintenance photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'nutri-maintenance-photos' AND auth.uid() IS NOT NULL);