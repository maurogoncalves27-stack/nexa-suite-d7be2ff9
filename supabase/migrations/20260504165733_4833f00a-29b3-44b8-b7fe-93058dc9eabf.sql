UPDATE public.employees
SET
  work_regime = COALESCE(NULLIF(BTRIM(work_regime), ''), 'clt'),
  salary_type = COALESCE(NULLIF(BTRIM(salary_type), ''), 'mensal')
WHERE COALESCE(BTRIM(work_regime), '') = ''
   OR COALESCE(BTRIM(salary_type), '') = '';