GRANT DELETE ON public.chat_conversations TO authenticated;
CREATE POLICY "Admin/Manager exclui conversas" ON public.chat_conversations
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));