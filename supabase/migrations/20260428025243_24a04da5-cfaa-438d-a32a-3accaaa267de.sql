UPDATE public.inventory_counts
SET status='cancelled',
    notes = COALESCE(notes,'') || ' [auto-cancelada: contagem órfã sem itens em 28/abr/2026]'
WHERE status IN ('open','submitted')
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_count_items i WHERE i.count_id = inventory_counts.id
  );