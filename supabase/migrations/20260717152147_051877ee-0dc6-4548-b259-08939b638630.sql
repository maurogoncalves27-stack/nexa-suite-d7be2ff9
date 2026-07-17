GRANT SELECT, INSERT, UPDATE, DELETE ON public.sst_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sst_document_versions TO authenticated;
GRANT ALL ON public.sst_documents TO service_role;
GRANT ALL ON public.sst_document_versions TO service_role;