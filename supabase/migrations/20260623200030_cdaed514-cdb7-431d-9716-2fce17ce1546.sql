
CREATE TABLE IF NOT EXISTS public.pdv_ifood_widgets (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  brand text NOT NULL CHECK (brand IN ('aquela_parme','estrogonofe','box_caipira')),
  widget_id uuid NOT NULL,
  merchant_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (store_id, brand)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_ifood_widgets TO authenticated;
GRANT ALL ON public.pdv_ifood_widgets TO service_role;

ALTER TABLE public.pdv_ifood_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem widgets iFood"
  ON public.pdv_ifood_widgets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gerenciam widgets iFood"
  ON public.pdv_ifood_widgets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_user(auth.uid()));
