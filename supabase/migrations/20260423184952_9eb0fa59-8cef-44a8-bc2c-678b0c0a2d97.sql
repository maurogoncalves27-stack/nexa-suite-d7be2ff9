CREATE OR REPLACE FUNCTION public.active_maintenance_for_employee(_user_id uuid)
RETURNS TABLE (
  id uuid,
  store_id uuid,
  store_name text,
  equipment_type text,
  description text,
  urgency text,
  status text,
  approval_instructions text,
  approved_at timestamptz,
  requested_at timestamptz,
  user_id uuid,
  professional_name text,
  professional_phone text,
  professional_role text,
  company_name text,
  company_phone text,
  company_contact_name text,
  company_contact_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.store_id,
    s.name AS store_name,
    r.equipment_type,
    r.description,
    r.urgency,
    r.status,
    r.approval_instructions,
    r.approved_at,
    r.requested_at,
    r.user_id,
    p.full_name AS professional_name,
    p.phone AS professional_phone,
    p.role_title AS professional_role,
    c.trade_name AS company_name,
    c.phone AS company_phone,
    c.contact_name AS company_contact_name,
    c.contact_phone AS company_contact_phone
  FROM public.nutri_maintenance_requests r
  LEFT JOIN public.stores s ON s.id = r.store_id
  LEFT JOIN public.outsourced_professionals p ON p.id = r.assigned_professional_id
  LEFT JOIN public.outsourced_companies c ON c.id = r.assigned_company_id
  WHERE r.status = 'approved'
    AND (
      public.user_can_access_store(_user_id, r.store_id)
      OR public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'manager'::app_role)
    )
  ORDER BY r.approved_at DESC NULLS LAST, r.requested_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.active_maintenance_for_employee(uuid) TO authenticated;