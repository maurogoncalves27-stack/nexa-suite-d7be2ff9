CREATE OR REPLACE FUNCTION public.list_store_birthdays(_store_ids uuid[])
 RETURNS TABLE(id uuid, display_name text, job_position text, birth_month integer, birth_day integer, photo_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    e.id,
    split_part(e.full_name, ' ', 1) AS display_name,
    e.position AS job_position,
    EXTRACT(MONTH FROM e.birth_date)::int AS birth_month,
    EXTRACT(DAY FROM e.birth_date)::int AS birth_day,
    COALESCE(
      e.avatar_path,
      (SELECT fd.photo_path
         FROM public.employee_face_descriptors fd
        WHERE fd.employee_id = e.id AND fd.is_active = TRUE
        LIMIT 1)
    ) AS photo_path
  FROM public.employees e
  WHERE e.status IN ('active', 'in_training')
    AND e.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM e.birth_date)::int = EXTRACT(MONTH FROM CURRENT_DATE)::int
    AND (
      e.store_id = ANY(_store_ids)
      OR e.allocated_store_id = ANY(_store_ids)
    );
$function$;