CREATE OR REPLACE FUNCTION public.get_employee_cost_center(_employee_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fabrica AS (
    SELECT id FROM public.stores
    WHERE is_virtual = false AND upper(name) IN ('FABRICA','FÁBRICA')
    LIMIT 1
  ),
  emp AS (
    SELECT COALESCE(allocated_store_id, store_id) AS sid
    FROM public.employees WHERE id = _employee_id
  )
  SELECT CASE
    WHEN emp.sid IS NULL THEN (SELECT id FROM fabrica)
    WHEN EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = emp.sid AND (s.is_virtual = true OR upper(s.name) LIKE '%ESTOQUE%')
    ) THEN (SELECT id FROM fabrica)
    ELSE emp.sid
  END
  FROM emp;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_cost_center_by_name(_full_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fabrica AS (
    SELECT id FROM public.stores
    WHERE is_virtual = false AND upper(name) IN ('FABRICA','FÁBRICA')
    LIMIT 1
  ),
  emp AS (
    SELECT public.get_employee_cost_center(id) AS sid
    FROM public.employees
    WHERE upper(trim(full_name)) = upper(trim(_full_name))
    ORDER BY (status = 'active') DESC, (status = 'in_training') DESC
    LIMIT 1
  )
  SELECT COALESCE((SELECT sid FROM emp), (SELECT id FROM fabrica));
$$;

WITH matched AS (
  SELECT ap.id,
         public.get_employee_cost_center_by_name(
           COALESCE(NULLIF(ap.supplier_name, ''), NULLIF(ap.beneficiary, ''))
         ) AS new_store_id
  FROM public.accounts_payable ap
  WHERE EXISTS (
    SELECT 1 FROM public.employees e
    WHERE upper(trim(e.full_name)) = upper(trim(COALESCE(ap.supplier_name, ap.beneficiary)))
  )
)
UPDATE public.accounts_payable ap
SET store_id = m.new_store_id
FROM matched m
WHERE ap.id = m.id
  AND m.new_store_id IS NOT NULL
  AND ap.store_id IS DISTINCT FROM m.new_store_id;