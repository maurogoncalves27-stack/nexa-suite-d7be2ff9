-- Useful documents categories and files
CREATE TABLE public.useful_doc_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE TABLE public.useful_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.useful_doc_categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_useful_documents_category ON public.useful_documents(category_id);

ALTER TABLE public.useful_doc_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.useful_documents ENABLE ROW LEVEL SECURITY;

-- Only admin and manager can view/manage
CREATE POLICY "Staff view useful_doc_categories"
ON public.useful_doc_categories FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin manage useful_doc_categories"
ON public.useful_doc_categories FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff view useful_documents"
ON public.useful_documents FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin manage useful_documents"
ON public.useful_documents FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_useful_doc_categories_updated_at
BEFORE UPDATE ON public.useful_doc_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_useful_documents_updated_at
BEFORE UPDATE ON public.useful_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pre-seed common types
INSERT INTO public.useful_doc_categories (name, sort_order) VALUES
  ('Manuais', 10),
  ('Políticas', 20),
  ('Formulários', 30),
  ('Treinamentos', 40),
  ('Outros', 999);

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('useful-documents', 'useful-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff read useful-documents bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'useful-documents' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

CREATE POLICY "Admin upload useful-documents bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'useful-documents' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin update useful-documents bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'useful-documents' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin delete useful-documents bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'useful-documents' AND has_role(auth.uid(), 'admin'));