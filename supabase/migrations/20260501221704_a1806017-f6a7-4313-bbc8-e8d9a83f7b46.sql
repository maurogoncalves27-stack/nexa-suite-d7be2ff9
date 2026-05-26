-- Corrige contratos com placeholder de responsabilidades pelas atribuições reais do cargo
WITH resp_per_position AS (
  SELECT position,
         string_agg('  • ' || responsibility, E'\n' ORDER BY sort_order) AS resp_text
  FROM public.position_responsibilities
  WHERE is_active = true
  GROUP BY position
),
updated AS (
  SELECT cs.id,
         REPLACE(
           cs.content,
           '  • (Não há responsabilidades cadastradas para este cargo)',
           rpp.resp_text || E'\n\n[Correção administrativa em 2026-05-01: lista de atribuições do cargo "' || e.position || '" preenchida automaticamente com base nas responsabilidades cadastradas no sistema. Data, IP e assinatura original do(a) colaborador(a) permanecem inalterados.]'
         ) AS new_content
  FROM public.contract_signatures cs
  JOIN public.employees e ON e.id = cs.employee_id
  JOIN resp_per_position rpp ON LOWER(TRIM(e.position)) = LOWER(TRIM(rpp.position))
  WHERE cs.superseded_at IS NULL
    AND cs.content LIKE '%(Não há responsabilidades cadastradas para este cargo)%'
)
UPDATE public.contract_signatures cs
SET content = u.new_content,
    content_hash = encode(digest(u.new_content, 'sha256'), 'hex')
FROM updated u
WHERE cs.id = u.id;