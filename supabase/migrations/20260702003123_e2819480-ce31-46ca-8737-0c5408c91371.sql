
-- 1. giana_feedback
CREATE TABLE public.giana_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  conversation_source text NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' | 'widget'
  phone text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  rating text CHECK (rating IN ('positive','negative')),
  comment text,
  sentiment text CHECK (sentiment IN ('positive','neutral','negative')),
  raw_response text,
  asked_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_giana_feedback_created ON public.giana_feedback(created_at DESC);
CREATE INDEX idx_giana_feedback_store ON public.giana_feedback(store_id);
CREATE INDEX idx_giana_feedback_rating ON public.giana_feedback(rating);
CREATE INDEX idx_giana_feedback_conv ON public.giana_feedback(conversation_id);

GRANT SELECT ON public.giana_feedback TO authenticated;
GRANT ALL ON public.giana_feedback TO service_role;
ALTER TABLE public.giana_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager view giana feedback"
  ON public.giana_feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 2. giana_weekly_reports
CREATE TABLE public.giana_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'completed', -- 'running' | 'completed' | 'failed'
  conversations_total int DEFAULT 0,
  conversations_analyzed int DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(week_start)
);
CREATE INDEX idx_giana_weekly_reports_week ON public.giana_weekly_reports(week_start DESC);

GRANT SELECT ON public.giana_weekly_reports TO authenticated;
GRANT ALL ON public.giana_weekly_reports TO service_role;
ALTER TABLE public.giana_weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager view giana weekly reports"
  ON public.giana_weekly_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 3. Feedback flags nas conversas
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_rating text;

ALTER TABLE public.whatsapp_customer_conversations
  ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_rating text;

-- 4. Histórico de prompt da Giana (WhatsApp cliente)
ALTER TABLE public.whatsapp_customer_config
  ADD COLUMN IF NOT EXISTS prompt_history jsonb NOT NULL DEFAULT '[]'::jsonb;
