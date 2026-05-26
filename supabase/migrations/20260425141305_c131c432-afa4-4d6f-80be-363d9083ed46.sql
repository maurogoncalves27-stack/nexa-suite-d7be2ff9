-- Tabela independente de receituários (snapshot, sem FK para recipes)
CREATE TABLE public.recipe_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  photo_path text,
  ingredients text,
  preparation_method text,
  yield_text text,
  prep_time_minutes integer,
  source_recipe_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recipe books"
  ON public.recipe_books FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins/managers can insert recipe books"
  ON public.recipe_books FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admins/managers can update recipe books"
  ON public.recipe_books FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admins/managers can delete recipe books"
  ON public.recipe_books FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER update_recipe_books_updated_at
  BEFORE UPDATE ON public.recipe_books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket de fotos
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-book-photos', 'recipe-book-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view recipe book photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-book-photos');

CREATE POLICY "Admins/managers can upload recipe book photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'recipe-book-photos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));

CREATE POLICY "Admins/managers can update recipe book photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'recipe-book-photos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));

CREATE POLICY "Admins/managers can delete recipe book photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'recipe-book-photos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));