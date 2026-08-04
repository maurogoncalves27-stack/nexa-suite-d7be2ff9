CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log"
ON public.audit_log FOR SELECT TO authenticated
USING (
  public.is_super_user((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_time ON public.audit_log (table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log (table_name, record_id);

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := (to_jsonb(OLD) ->> 'id');
    INSERT INTO public.audit_log (table_name, record_id, action, changed_by, old_data)
    VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    rec_id := (to_jsonb(NEW) ->> 'id');
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      INSERT INTO public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
      VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSE
    rec_id := (to_jsonb(NEW) ->> 'id');
    INSERT INTO public.audit_log (table_name, record_id, action, changed_by, new_data)
    VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_payroll_calculated ON public.payroll_calculated;
CREATE TRIGGER trg_audit_payroll_calculated
AFTER INSERT OR UPDATE OR DELETE ON public.payroll_calculated
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_accounts_payable ON public.accounts_payable;
CREATE TRIGGER trg_audit_accounts_payable
AFTER INSERT OR UPDATE OR DELETE ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_inventory_stock_movements ON public.inventory_stock_movements;
CREATE TRIGGER trg_audit_inventory_stock_movements
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_employees ON public.employees;
CREATE TRIGGER trg_audit_employees
AFTER UPDATE OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();