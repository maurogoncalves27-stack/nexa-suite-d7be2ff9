-- A política de RLS já permite admin gerenciar ecommerce_stores, mas o GRANT de
-- tabela só dava SELECT — então ligar entrega/retirada pelo painel de entregas
-- falhava com "permission denied". RLS continua sendo o controle de acesso.
GRANT INSERT, UPDATE, DELETE ON public.ecommerce_stores TO authenticated;
