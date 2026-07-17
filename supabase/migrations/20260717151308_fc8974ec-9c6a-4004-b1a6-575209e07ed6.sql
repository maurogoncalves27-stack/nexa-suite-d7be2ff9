
CREATE OR REPLACE FUNCTION public.check_mental_health_cid_cluster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_count int;
BEGIN
  IF NEW.cid_code IS NULL OR upper(left(NEW.cid_code, 1)) <> 'F' THEN
    RETURN NEW;
  END IF;

  SELECT e.store_id INTO v_store_id FROM public.employees e WHERE e.id = NEW.employee_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(DISTINCT mc.employee_id) INTO v_count
  FROM public.medical_certificates mc
  JOIN public.employees e ON e.id = mc.employee_id
  WHERE e.store_id = v_store_id
    AND upper(left(coalesce(mc.cid_code,''), 1)) = 'F'
    AND mc.certificate_date >= (CURRENT_DATE - INTERVAL '90 days');

  IF v_count >= 3 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.psychosocial_risks
      WHERE store_id = v_store_id
        AND auto_generated = true
        AND status IN ('open','in_progress')
        AND source = 'cid_f_cluster'
    ) THEN
      INSERT INTO public.psychosocial_risks
        (store_id, category, description, severity, probability, source, auto_generated, status)
      VALUES (
        v_store_id,
        'saude_mental',
        format('Cluster de %s afastamentos com CID F (transtornos mentais) nos últimos 90 dias. Investigar causas e definir plano de ação.', v_count),
        'high',
        'high',
        'cid_f_cluster',
        true,
        'open'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
