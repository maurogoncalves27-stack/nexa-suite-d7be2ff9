-- 1. Yolo vouchers: restrict writes to service_role only
DROP POLICY IF EXISTS "Service role updates yolo vouchers log" ON public.yolo_vouchers_used;
DROP POLICY IF EXISTS "Service role writes yolo vouchers log" ON public.yolo_vouchers_used;

CREATE POLICY "Service role writes yolo vouchers log"
  ON public.yolo_vouchers_used
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role updates yolo vouchers log"
  ON public.yolo_vouchers_used
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Views: enforce querying user's RLS instead of view owner's
ALTER VIEW public.giana_menu_dishes SET (security_invoker = on);
ALTER VIEW public.v_mood_weekly_store_agg SET (security_invoker = on);
ALTER VIEW public.v_finance_allocations_effective SET (security_invoker = on);

-- 3. Functions without a fixed search_path
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.gas_sync_has_reserve() SET search_path = public;