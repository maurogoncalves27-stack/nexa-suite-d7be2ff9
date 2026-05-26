-- Adicionar timestamp de marcação e suporte a múltiplas fotos por item
ALTER TABLE public.checklist_answers
  ADD COLUMN IF NOT EXISTS checked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}'::text[];

-- Backfill: migrar photo_url única para o array
UPDATE public.checklist_answers
SET photo_urls = ARRAY[photo_url]
WHERE photo_url IS NOT NULL
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

-- Backfill: marcar checked_at para itens já marcados (usa updated_at como melhor estimativa)
UPDATE public.checklist_answers
SET checked_at = updated_at
WHERE checked = true AND checked_at IS NULL;