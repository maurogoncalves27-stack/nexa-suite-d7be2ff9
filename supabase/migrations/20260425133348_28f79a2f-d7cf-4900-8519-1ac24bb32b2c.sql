CREATE TABLE public.recipe_book_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL UNIQUE REFERENCES public.recipes(id) ON DELETE CASCADE,
  photo_path TEXT,
  description TEXT,
  prep_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_book_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recipe book entries"
  ON public.recipe_book_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin/manager can insert recipe book entries"
  ON public.recipe_book_entries FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/manager can update recipe book entries"
  ON public.recipe_book_entries FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/manager can delete recipe book entries"
  ON public.recipe_book_entries FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_recipe_book_entries_updated_at
  BEFORE UPDATE ON public.recipe_book_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();