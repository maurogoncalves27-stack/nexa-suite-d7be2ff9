-- Enum: tipos de gatilho
CREATE TYPE public.automation_trigger_type AS ENUM (
  'late_arrival',           -- atraso na entrada > X minutos
  'wrong_punch',            -- sequência de batidas incompleta/fora de ordem
  'unjustified_absence',    -- faltou sem justificativa nem afastamento
  'infraction_recurrence'   -- N infrações de um tipo em X dias → advertência
);

-- Tabela principal de regras
CREATE TABLE public.automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type public.automation_trigger_type NOT NULL,
  -- Parâmetros do gatilho. Exemplos por tipo:
  --   late_arrival:           { "tolerance_min": 15 }
  --   wrong_punch:            {}
  --   unjustified_absence:    {}
  --   infraction_recurrence:  { "infraction_type_id": "...", "count": 3, "window_days": 7 }
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Ações disparadas. Exemplo:
  --   {
  --     "apply_infraction": { "infraction_type_id": "...", "weight": 1 },
  --     "create_warning":   { "title": "...", "template": "..." },
  --     "notify_manager":   true
  --   }
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false, -- regra default do sistema
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_rules_active_type ON public.automation_rules(is_active, trigger_type);

-- Log de execuções
CREATE TABLE public.automation_rule_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  trigger_type public.automation_trigger_type NOT NULL,
  reference_date DATE,
  scanned INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  infractions_created INTEGER NOT NULL DEFAULT 0,
  warnings_created INTEGER NOT NULL DEFAULT 0,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  detail JSONB,
  error TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_rule_runs_rule_date ON public.automation_rule_runs(rule_id, ran_at DESC);

-- RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rule_runs ENABLE ROW LEVEL SECURITY;

-- Helper: pode gerenciar?
CREATE OR REPLACE FUNCTION public.can_manage_automation_rules(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_user(_user_id)
    OR public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'hr');
$$;

-- Policies: leitura ampla para staff autenticado
CREATE POLICY "Staff can view automation rules"
  ON public.automation_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert automation rules"
  ON public.automation_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_automation_rules(auth.uid()));

CREATE POLICY "Managers can update automation rules"
  ON public.automation_rules FOR UPDATE
  TO authenticated
  USING (public.can_manage_automation_rules(auth.uid()))
  WITH CHECK (public.can_manage_automation_rules(auth.uid()));

CREATE POLICY "Managers can delete non-system rules"
  ON public.automation_rules FOR DELETE
  TO authenticated
  USING (public.can_manage_automation_rules(auth.uid()) AND is_system = false);

CREATE POLICY "Staff can view automation runs"
  ON public.automation_rule_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can insert automation runs"
  ON public.automation_rule_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: regras default (sistema) replicando o comportamento atual dos crons
INSERT INTO public.automation_rules (name, description, trigger_type, params, actions, is_active, is_system) VALUES
(
  'Atrasos > 15 min',
  'Aplica infração quando o colaborador chega mais de 15 minutos após o horário da escala.',
  'late_arrival',
  jsonb_build_object('tolerance_min', 15),
  jsonb_build_object(
    'apply_infraction', jsonb_build_object(
      'infraction_type_id', 'd1292482-18e0-4960-8d4b-40cf8d5a02b4',
      'weight', 1
    ),
    'notify_manager', true
  ),
  true, true
),
(
  'Bater ponto errado',
  'Aplica infração quando a sequência de batidas está incompleta ou fora de ordem.',
  'wrong_punch',
  '{}'::jsonb,
  jsonb_build_object(
    'apply_infraction', jsonb_build_object(
      'infraction_type_id', '1dd48271-a7f1-4914-8f7f-a99c90ccd98e',
      'weight', 3
    ),
    'notify_manager', true
  ),
  true, true
),
(
  'Falta sem justificativa',
  'Aplica infração quando o colaborador não bate ponto no dia escalado, sem justificativa nem afastamento.',
  'unjustified_absence',
  '{}'::jsonb,
  jsonb_build_object(
    'apply_infraction', jsonb_build_object(
      'infraction_type_id', '70657a3f-5811-4d06-92f6-52df6c10e9af',
      'weight', 5
    ),
    'notify_manager', true
  ),
  true, true
),
(
  'Advertência por 3 atrasos em 7 dias',
  'Gera advertência escrita quando o colaborador acumula 3 ou mais atrasos > 15 min em 7 dias corridos.',
  'infraction_recurrence',
  jsonb_build_object(
    'infraction_type_id', 'd1292482-18e0-4960-8d4b-40cf8d5a02b4',
    'count', 3,
    'window_days', 7
  ),
  jsonb_build_object(
    'create_warning', jsonb_build_object(
      'title', 'Advertência escrita — atrasos recorrentes',
      'template', 'O(a) colaborador(a) {{name}} acumulou {{count}} atrasos superiores a 15 minutos nos últimos 7 dias (datas: {{dates}}).\n\nConforme as normas internas, fica formalmente advertido(a). Reincidências poderão acarretar medidas disciplinares mais severas, incluindo suspensão e/ou rescisão por justa causa.\n\nEsta advertência foi gerada automaticamente pelo sistema com base nos registros de ponto.'
    ),
    'notify_manager', true
  ),
  true, true
);