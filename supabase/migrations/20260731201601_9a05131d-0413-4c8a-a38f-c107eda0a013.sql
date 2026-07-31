GRANT SELECT ON public.pdv_tef_config TO authenticated;

DROP POLICY IF EXISTS "Store terminals can read own TEF config" ON public.pdv_tef_config;
CREATE POLICY "Store terminals can read own TEF config"
ON public.pdv_tef_config
FOR SELECT
TO authenticated
USING (store_id = public.get_user_store(auth.uid()));