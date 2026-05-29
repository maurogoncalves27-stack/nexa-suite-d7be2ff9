-- 1) STORES: remover SELECT amplo em colunas sensíveis (CSC NFC-e)
REVOKE SELECT ON public.stores FROM authenticated;
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (
  id, name, code, address, city, state, phone, manager_name, is_active,
  created_at, updated_at, parent_store_id, cnpj, legal_name, latitude, longitude,
  geofence_radius_m, zip_code, is_virtual, brand, store_type, brand_id,
  ifood_merchant_id, ifood_merchant_uuid, ifood_environment, inscricao_estadual,
  inscricao_municipal, regime_tributario, nfce_serie, nfce_next_number,
  nfce_environment, neighborhood, number, pdv_sla_minutes, ifood_auto_accept
) ON public.stores TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;

-- 2) CUSTOMER_REVIEWS: escopar por loja + role
DROP POLICY IF EXISTS "Equipe lê avaliações" ON public.customer_reviews;
CREATE POLICY "Staff reads reviews scoped by store"
  ON public.customer_reviews
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      (public.has_role(auth.uid(), 'manager'::app_role)
       OR public.has_role(auth.uid(), 'employee'::app_role))
      AND (store_id IS NULL OR public.user_can_access_store(auth.uid(), store_id))
    )
  );

-- 3) PDV_ORDER_EVENTS: escopar leitura por loja
DROP POLICY IF EXISTS "auth read pdv_order_events" ON public.pdv_order_events;
CREATE POLICY "auth read pdv_order_events scoped"
  ON public.pdv_order_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (store_id IS NOT NULL AND public.user_can_access_store(auth.uid(), store_id))
  );

-- 4) CANDIDATE_DOCUMENT_UPLOADS: helper que valida candidato por id (token via link já validou no fluxo)
CREATE OR REPLACE FUNCTION public.candidate_accepts_uploads(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_candidates
    WHERE id = _candidate_id
      AND document_upload_token IS NOT NULL
      AND documents_requested_at IS NOT NULL
  );
$$;
GRANT EXECUTE ON FUNCTION public.candidate_accepts_uploads(uuid) TO anon, authenticated;

CREATE POLICY "Candidate inserts upload metadata"
  ON public.candidate_document_uploads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.candidate_accepts_uploads(candidate_id));

GRANT INSERT ON public.candidate_document_uploads TO anon;
GRANT INSERT ON public.candidate_document_uploads TO authenticated;
