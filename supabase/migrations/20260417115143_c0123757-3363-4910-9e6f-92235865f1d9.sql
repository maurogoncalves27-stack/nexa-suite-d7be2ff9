-- ============================================
-- 1) Tabela de descritores faciais
-- ============================================
CREATE TABLE public.employee_face_descriptors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  descriptor REAL[] NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 1,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_face_descriptors_active_per_employee
  ON public.employee_face_descriptors(employee_id)
  WHERE is_active = true;

ALTER TABLE public.employee_face_descriptors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colab vê seu próprio descritor"
  ON public.employee_face_descriptors FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Colab cadastra seu próprio descritor"
  ON public.employee_face_descriptors FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Colab atualiza seu próprio descritor"
  ON public.employee_face_descriptors FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Admin/manager removem descritor"
  ON public.employee_face_descriptors FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_face_descriptors_updated
  BEFORE UPDATE ON public.employee_face_descriptors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2) Enum + tabela de batidas de ponto
-- ============================================
CREATE TYPE public.time_clock_entry_type AS ENUM (
  'clock_in',         -- entrada
  'break_start',      -- saída para intervalo
  'break_end',        -- retorno do intervalo
  'clock_out'         -- saída
);

CREATE TABLE public.time_clock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  entry_type public.time_clock_entry_type NOT NULL,
  entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  match_score NUMERIC(5,4),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  accuracy_m NUMERIC(8,2),
  photo_path TEXT,
  notes TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_clock_employee_date ON public.time_clock_entries(employee_id, reference_date DESC);
CREATE INDEX idx_time_clock_store_date ON public.time_clock_entries(store_id, reference_date DESC);
CREATE INDEX idx_time_clock_entry_at ON public.time_clock_entries(entry_at DESC);

ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colab vê suas próprias batidas"
  ON public.time_clock_entries FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'manager')
        AND store_id IS NOT NULL
        AND public.user_can_access_store(auth.uid(), store_id))
  );

CREATE POLICY "Colab registra suas próprias batidas"
  ON public.time_clock_entries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Admin/manager ajustam batidas"
  ON public.time_clock_entries FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'manager')
        AND store_id IS NOT NULL
        AND public.user_can_access_store(auth.uid(), store_id))
  );

CREATE POLICY "Admin remove batidas"
  ON public.time_clock_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_time_clock_updated
  BEFORE UPDATE ON public.time_clock_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3) Bucket de fotos de ponto (privado)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('time-clock-photos', 'time-clock-photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Colab vê suas fotos de ponto"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'time-clock-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid() AND (storage.foldername(name))[1] = e.id::text
      )
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
    )
  );

CREATE POLICY "Colab envia suas fotos de ponto"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'time-clock-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid() AND (storage.foldername(name))[1] = e.id::text
      )
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
    )
  );

CREATE POLICY "Admin remove fotos de ponto"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'time-clock-photos' AND public.has_role(auth.uid(), 'admin'));