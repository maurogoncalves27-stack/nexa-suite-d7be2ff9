CREATE OR REPLACE FUNCTION public.freelancer_check_punch(
  _job_id uuid,
  _kind text,
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_fl uuid;
  v_job record;
  v_store record;
  v_payment_id uuid;
  v_dist numeric := NULL;
  v_within boolean := NULL;
  v_radius integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id INTO v_fl FROM public.freelancers WHERE user_id = v_uid LIMIT 1;
  IF v_fl IS NULL THEN
    RAISE EXCEPTION 'Freelancer não encontrado';
  END IF;

  SELECT * INTO v_job FROM public.freelancer_job_openings WHERE id = _job_id;
  IF v_job IS NULL OR v_job.filled_freelancer_id IS DISTINCT FROM v_fl THEN
    RAISE EXCEPTION 'Vaga não pertence a você';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_job.store_id;

  IF _lat IS NOT NULL AND _lng IS NOT NULL AND v_store.latitude IS NOT NULL AND v_store.longitude IS NOT NULL THEN
    v_dist := 6371000 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(_lat)) * cos(radians(v_store.latitude)) *
        cos(radians(v_store.longitude) - radians(_lng)) +
        sin(radians(_lat)) * sin(radians(v_store.latitude))
      ))
    );
    v_radius := COALESCE(v_store.geofence_radius_m, 200);
    v_within := v_dist <= v_radius;
  END IF;

  v_payment_id := v_job.payment_id;

  IF v_payment_id IS NULL THEN
    INSERT INTO public.freelancer_daily_payments (freelancer_id, store_id, work_date, amount, status, created_by)
    VALUES (v_fl, v_job.store_id, v_job.work_date, COALESCE(v_job.amount, 0), 'pending', v_uid)
    RETURNING id INTO v_payment_id;

    UPDATE public.freelancer_job_openings SET payment_id = v_payment_id WHERE id = _job_id;
  END IF;

  IF _kind = 'in' THEN
    UPDATE public.freelancer_daily_payments
      SET check_in_at = COALESCE(check_in_at, now()),
          check_in_lat = COALESCE(check_in_lat, _lat),
          check_in_lng = COALESCE(check_in_lng, _lng),
          check_in_within_geofence = COALESCE(check_in_within_geofence, v_within),
          check_in_distance_m = COALESCE(check_in_distance_m, round(v_dist)::int)
    WHERE id = v_payment_id;
  ELSIF _kind = 'out' THEN
    UPDATE public.freelancer_daily_payments
      SET check_out_at = COALESCE(check_out_at, now()),
          check_out_lat = COALESCE(check_out_lat, _lat),
          check_out_lng = COALESCE(check_out_lng, _lng),
          check_out_within_geofence = COALESCE(check_out_within_geofence, v_within),
          check_out_distance_m = COALESCE(check_out_distance_m, round(v_dist)::int)
    WHERE id = v_payment_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido';
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'distance_m', round(COALESCE(v_dist, 0)),
    'within_geofence', v_within
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.freelancer_check_punch(uuid, text, numeric, numeric) TO authenticated;