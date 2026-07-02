ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS triage jsonb,
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_has_issue
  ON public.chat_conversations ((triage->>'has_issue'))
  WHERE triage->>'has_issue' = 'true';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_triaged_at
  ON public.chat_conversations (triaged_at);