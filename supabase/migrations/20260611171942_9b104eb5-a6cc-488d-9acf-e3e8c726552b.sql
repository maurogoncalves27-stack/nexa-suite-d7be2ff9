
-- 1) iFood tokens: restrict SELECT to admin/super_user (remove manager)
DROP POLICY IF EXISTS "ifood_tokens_read_admin" ON public.pdv_ifood_tokens;
CREATE POLICY "ifood_tokens_read_admin"
ON public.pdv_ifood_tokens
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_user(auth.uid()));

-- 2) Store fiscal credentials (NFC-e CSC): restrict to admin/super_user
--    Keep "Store login manages own fiscal credentials" intact for terminal login flow.
DROP POLICY IF EXISTS "Staff manage fiscal credentials" ON public.store_fiscal_credentials;
CREATE POLICY "Admins manage fiscal credentials"
ON public.store_fiscal_credentials
FOR ALL
TO authenticated
USING (is_super_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (is_super_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 3) Vault credentials (plaintext passwords): admin-only read + write
DROP POLICY IF EXISTS "Staff view vault_credentials" ON public.vault_credentials;
DROP POLICY IF EXISTS "Staff manage vault_credentials" ON public.vault_credentials;
CREATE POLICY "Admins view vault_credentials"
ON public.vault_credentials
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_user(auth.uid()));
CREATE POLICY "Admins manage vault_credentials"
ON public.vault_credentials
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_user(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_user(auth.uid()));

-- 4) WhatsApp customer complaints/conversations: HR has no business need
DROP POLICY IF EXISTS "Admins veem reclamacoes WA cliente" ON public.whatsapp_customer_complaints;
CREATE POLICY "Admins veem reclamacoes WA cliente"
ON public.whatsapp_customer_complaints
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Admins veem conversas WA cliente" ON public.whatsapp_customer_conversations;
CREATE POLICY "Admins veem conversas WA cliente"
ON public.whatsapp_customer_conversations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_user(auth.uid()));
