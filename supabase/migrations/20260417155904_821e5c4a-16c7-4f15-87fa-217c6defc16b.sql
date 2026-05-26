
-- =========================================================
-- MIGRAÇÃO: Alinhar esquema de checklists ao "Checklist Pro"
-- =========================================================

-- 1. Limpar dados antigos (já confirmado anteriormente)
DELETE FROM public.checklist_answers;
DELETE FROM public.checklist_submissions;
DELETE FROM public.checklist_items;
DELETE FROM public.checklist_template_assignments;
DELETE FROM public.template_access_groups;
DELETE FROM public.checklist_templates;

-- 2. Renomear colunas de checklist_items
ALTER TABLE public.checklist_items RENAME COLUMN text TO label;
ALTER TABLE public.checklist_items RENAME COLUMN display_order TO sort_order;

-- 3. Renomear colunas de checklist_answers
ALTER TABLE public.checklist_answers RENAME COLUMN is_checked TO checked;
ALTER TABLE public.checklist_answers RENAME COLUMN notes TO observation;
ALTER TABLE public.checklist_answers RENAME COLUMN photo_path TO photo_url;

-- 4. Renomear colunas de checklist_submissions
ALTER TABLE public.checklist_submissions RENAME COLUMN reference_date TO shift_date;
ALTER TABLE public.checklist_submissions RENAME COLUMN general_notes TO notes;
ALTER TABLE public.checklist_submissions RENAME COLUMN employee_id TO user_id;
-- user_id agora aponta pra auth.users (não mais employees)
ALTER TABLE public.checklist_submissions DROP CONSTRAINT IF EXISTS checklist_submissions_employee_id_fkey;

-- 5. Renomear colunas de checklist_templates
ALTER TABLE public.checklist_templates RENAME COLUMN name TO title;
ALTER TABLE public.checklist_templates RENAME COLUMN description TO observations_legacy;
ALTER TABLE public.checklist_templates ADD COLUMN description text;
ALTER TABLE public.checklist_templates ADD COLUMN observations text;

-- 6. Tabela user_access_groups (vincula auth.users a grupos)
CREATE TABLE IF NOT EXISTS public.user_access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);

ALTER TABLE public.user_access_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_access_groups"
  ON public.user_access_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own group memberships"
  ON public.user_access_groups FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 7. Site settings (telas de configuração do Checklist Pro)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name text NOT NULL DEFAULT 'RH Plus',
  primary_color text NOT NULL DEFAULT '#1E40AF',
  secondary_color text NOT NULL DEFAULT '#3B82F6',
  background_color text NOT NULL DEFAULT '#F8FAFC',
  card_color text NOT NULL DEFAULT '#FFFFFF',
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site_settings"
  ON public.site_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update site_settings"
  ON public.site_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert site_settings"
  ON public.site_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.site_settings (app_name) VALUES ('RH Plus')
  ON CONFLICT DO NOTHING;

-- 8. Atualizar RLS de templates / items / submissions / answers pra novo modelo

-- Drop policies antigas que dependem dos nomes antigos de colunas/tabelas
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'checklist_templates','checklist_items','checklist_submissions',
        'checklist_answers','template_access_groups','checklist_template_assignments'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- checklist_templates
CREATE POLICY "Admins manage templates"
  ON public.checklist_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see active templates of their groups"
  ON public.checklist_templates FOR SELECT TO authenticated
  USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.template_access_groups tag
      JOIN public.user_access_groups uag ON uag.group_id = tag.group_id
      WHERE tag.template_id = checklist_templates.id
        AND uag.user_id = auth.uid()
    )
  );

-- checklist_items
CREATE POLICY "Admins manage items"
  ON public.checklist_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see items of their accessible templates"
  ON public.checklist_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_templates ct
      JOIN public.template_access_groups tag ON tag.template_id = ct.id
      JOIN public.user_access_groups uag ON uag.group_id = tag.group_id
      WHERE ct.id = checklist_items.template_id
        AND uag.user_id = auth.uid()
    )
  );

-- checklist_submissions
CREATE POLICY "Admins view all submissions"
  ON public.checklist_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view their own submissions"
  ON public.checklist_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert their own submissions"
  ON public.checklist_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their own submissions"
  ON public.checklist_submissions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins delete submissions"
  ON public.checklist_submissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- checklist_answers
CREATE POLICY "Admins view all answers"
  ON public.checklist_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view answers of their submissions"
  ON public.checklist_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_submissions cs
      WHERE cs.id = checklist_answers.submission_id AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert answers in their submissions"
  ON public.checklist_answers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklist_submissions cs
      WHERE cs.id = checklist_answers.submission_id AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update/delete answers in their submissions"
  ON public.checklist_answers FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_submissions cs
      WHERE cs.id = checklist_answers.submission_id AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete answers in their submissions"
  ON public.checklist_answers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_submissions cs
      WHERE cs.id = checklist_answers.submission_id AND cs.user_id = auth.uid()
    )
  );

-- template_access_groups
CREATE POLICY "Admins manage template_access_groups"
  ON public.template_access_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view template_access_groups for their groups"
  ON public.template_access_groups FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_access_groups uag
      WHERE uag.group_id = template_access_groups.group_id
        AND uag.user_id = auth.uid()
    )
  );

-- access_groups: garantir leitura por authenticated (admins veem tudo)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='access_groups'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.access_groups', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated read access_groups"
  ON public.access_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage access_groups"
  ON public.access_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. Constraints únicas pra evitar duplicações
ALTER TABLE public.checklist_submissions
  DROP CONSTRAINT IF EXISTS checklist_submissions_user_template_date_unique;
ALTER TABLE public.checklist_submissions
  ADD CONSTRAINT checklist_submissions_user_template_date_unique
  UNIQUE (user_id, template_id, shift_date);

ALTER TABLE public.checklist_answers
  DROP CONSTRAINT IF EXISTS checklist_answers_submission_item_unique;
ALTER TABLE public.checklist_answers
  ADD CONSTRAINT checklist_answers_submission_item_unique
  UNIQUE (submission_id, item_id);

-- 10. Profiles: leitura para admins (necessário pra dashboard listar nomes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
      ON public.profiles FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
