
-- ============ TABELAS ============

CREATE TABLE public.climate_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  quarter SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, quarter)
);
ALTER TABLE public.climate_surveys ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.climate_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dimension TEXT NOT NULL CHECK (dimension IN ('Liderança','Ambiente','Reconhecimento','Orgulho','Geral')),
  text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'scale_1_5' CHECK (question_type IN ('scale_1_5','enps_0_10','open_text')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.climate_questions ENABLE ROW LEVEL SECURITY;

-- Respostas SEM vínculo com colaborador. Apenas dados agregáveis.
CREATE TABLE public.climate_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.climate_surveys(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  position TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.climate_responses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_climate_responses_survey ON public.climate_responses(survey_id);
CREATE INDEX idx_climate_responses_store ON public.climate_responses(store_id);

CREATE TABLE public.climate_response_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id UUID NOT NULL REFERENCES public.climate_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.climate_questions(id) ON DELETE CASCADE,
  numeric_value NUMERIC,
  text_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id)
);
ALTER TABLE public.climate_response_answers ENABLE ROW LEVEL SECURITY;

-- Tabela de controle anti-duplicação. Separada para que não dê pra cruzar dados.
CREATE TABLE public.climate_response_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.climate_surveys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id)
);
ALTER TABLE public.climate_response_tokens ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGERS DE updated_at ============

CREATE TRIGGER update_climate_surveys_updated_at
BEFORE UPDATE ON public.climate_surveys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_climate_questions_updated_at
BEFORE UPDATE ON public.climate_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RLS POLICIES ============

-- Surveys: qualquer autenticado vê; admin gerencia
CREATE POLICY "Authenticated view climate surveys"
ON public.climate_surveys FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admin manage climate surveys"
ON public.climate_surveys FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Questions: qualquer autenticado vê ativas; admin gerencia
CREATE POLICY "Authenticated view climate questions"
ON public.climate_questions FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admin manage climate questions"
ON public.climate_questions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Responses: ninguém vê linhas individuais (nem admin via SELECT direto pra forçar uso de view agregada).
-- Permitimos INSERT por qualquer autenticado, SELECT só para admin (anônimo: sem user_id).
CREATE POLICY "Admin view climate responses"
ON public.climate_responses FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated insert climate responses"
ON public.climate_responses FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.climate_surveys s WHERE s.id = survey_id AND s.status = 'open')
);

-- Answers: idem
CREATE POLICY "Admin view climate answers"
ON public.climate_response_answers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated insert climate answers"
ON public.climate_response_answers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.climate_responses r
    JOIN public.climate_surveys s ON s.id = r.survey_id
    WHERE r.id = response_id AND s.status = 'open'
  )
);

-- Tokens: o próprio usuário insere/lê seu token (pra saber se já respondeu). Admin lê só pra contagem.
CREATE POLICY "User manage own climate token"
ON public.climate_response_tokens FOR ALL TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id);

-- ============ PERGUNTAS PADRÃO ============

INSERT INTO public.climate_questions (dimension, text, question_type, display_order) VALUES
  ('Liderança', 'Meu gestor direto me trata com respeito.', 'scale_1_5', 10),
  ('Liderança', 'Recebo feedback claro e construtivo do meu gestor.', 'scale_1_5', 20),
  ('Liderança', 'Confio nas decisões da liderança da empresa.', 'scale_1_5', 30),
  ('Ambiente', 'Tenho um bom relacionamento com meus colegas de trabalho.', 'scale_1_5', 40),
  ('Ambiente', 'O ambiente físico da minha loja oferece condições adequadas de trabalho.', 'scale_1_5', 50),
  ('Ambiente', 'Sinto-me seguro(a) para expressar minhas opiniões no trabalho.', 'scale_1_5', 60),
  ('Reconhecimento', 'Sinto que meu trabalho é reconhecido e valorizado.', 'scale_1_5', 70),
  ('Reconhecimento', 'Recebo elogios quando faço um bom trabalho.', 'scale_1_5', 80),
  ('Reconhecimento', 'Considero a remuneração e os benefícios justos para a minha função.', 'scale_1_5', 90),
  ('Orgulho', 'Tenho orgulho de trabalhar nesta empresa.', 'scale_1_5', 100),
  ('Orgulho', 'Vejo perspectiva de crescimento profissional aqui.', 'scale_1_5', 110),
  ('Orgulho', 'Estou satisfeito(a) com meu trabalho de forma geral.', 'scale_1_5', 120),
  ('Geral', 'Em uma escala de 0 a 10, o quanto você recomendaria esta empresa como um bom lugar para se trabalhar?', 'enps_0_10', 200),
  ('Geral', 'Deixe um comentário, sugestão ou crítica (opcional).', 'open_text', 300);

-- ============ CRIAÇÃO AUTOMÁTICA DE CAMPANHA TRIMESTRAL ============

CREATE OR REPLACE FUNCTION public.ensure_current_climate_survey()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cur_year SMALLINT;
  cur_quarter SMALLINT;
  q_start DATE;
  q_end DATE;
BEGIN
  cur_year := EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT;
  cur_quarter := EXTRACT(QUARTER FROM CURRENT_DATE)::SMALLINT;

  IF EXISTS (SELECT 1 FROM public.climate_surveys WHERE year = cur_year AND quarter = cur_quarter) THEN
    RETURN;
  END IF;

  q_start := make_date(cur_year, ((cur_quarter - 1) * 3) + 1, 1);
  q_end := (q_start + INTERVAL '3 months - 1 day')::DATE;

  INSERT INTO public.climate_surveys (name, year, quarter, start_date, end_date, status)
  VALUES (
    format('Clima Q%s/%s', cur_quarter, cur_year),
    cur_year,
    cur_quarter,
    q_start,
    q_end,
    'open'
  );
END;
$$;

-- Cron job: roda 1x ao dia, 3h da manhã, garantindo que sempre exista uma campanha aberta no trimestre.
-- Usa pg_cron sem net.http_post — chama a função local diretamente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ensure-climate-survey-quarterly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-climate-survey-quarterly');

    PERFORM cron.schedule(
      'ensure-climate-survey-quarterly',
      '0 3 * * *',
      $cron$ SELECT public.ensure_current_climate_survey(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron pode não estar habilitado; ignoramos silenciosamente
  NULL;
END $$;

-- Garante uma campanha aberta agora mesmo
SELECT public.ensure_current_climate_survey();
