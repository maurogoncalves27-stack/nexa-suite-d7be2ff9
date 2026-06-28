-- Remove mensagens duplicadas (mesmo role + conteúdo) dentro de cada conversa,
-- mantendo a primeira ocorrência por timestamp. Corrige histórico das conversas
-- (Angélica, Raffa, etc.) que mostraram cada resposta da Giana duplicada.
WITH exploded AS (
  SELECT
    c.id AS conv_id,
    ord.ordinality AS pos,
    msg
  FROM public.chat_conversations c,
       jsonb_array_elements(c.messages) WITH ORDINALITY AS ord(msg, ordinality)
), ranked AS (
  SELECT
    conv_id,
    pos,
    msg,
    row_number() OVER (
      PARTITION BY conv_id,
        lower(coalesce(msg->>'role','user')),
        lower(btrim(coalesce(msg->>'content','')))
      ORDER BY (msg->>'ts')::timestamptz NULLS LAST, pos
    ) AS rn
  FROM exploded
  WHERE btrim(coalesce(msg->>'content','')) <> ''
), kept AS (
  SELECT conv_id, jsonb_agg(msg ORDER BY (msg->>'ts')::timestamptz NULLS LAST, pos) AS new_messages
  FROM ranked
  WHERE rn = 1
  GROUP BY conv_id
)
UPDATE public.chat_conversations c
SET messages = kept.new_messages,
    message_count = jsonb_array_length(kept.new_messages),
    updated_at = now()
FROM kept
WHERE kept.conv_id = c.id
  AND jsonb_array_length(kept.new_messages) <> jsonb_array_length(c.messages);