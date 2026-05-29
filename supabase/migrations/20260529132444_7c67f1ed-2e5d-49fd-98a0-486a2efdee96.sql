-- Restaurar SELECT amplo em stores (a separação dos CSC fields deve ser feita movendo-os de fato para store_fiscal_credentials antes de revogar colunas)
GRANT SELECT ON public.stores TO authenticated;
GRANT SELECT ON public.stores TO anon;