CREATE OR REPLACE FUNCTION public.operational_health()
RETURNS TABLE (
  store_id uuid,
  store_name text,
  last_order_at timestamptz,
  orders_today integer,
  revenue_today numeric,
  last_invoice_at timestamptz,
  last_invoice_status text,
  invoice_errors_24h integer,
  tef_provider text,
  tef_environment text,
  tef_active boolean,
  last_tef_at timestamptz,
  last_tef_status text,
  tef_errors_24h integer,
  printers_active integer,
  allow_order_type boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    o.last_order_at,
    COALESCE(o.orders_today, 0)::integer,
    COALESCE(o.revenue_today, 0)::numeric,
    f.last_invoice_at,
    f.last_invoice_status,
    COALESCE(f.errors_24h, 0)::integer,
    t.provider,
    t.environment,
    COALESCE(t.is_active, false),
    x.last_tef_at,
    x.last_tef_status,
    COALESCE(x.errors_24h, 0)::integer,
    COALESCE(p.printers_active, 0)::integer,
    COALESCE(s.totem_allow_order_type, false)
  FROM public.stores s
  LEFT JOIN LATERAL (
    SELECT
      max(po.created_at) AS last_order_at,
      count(*) FILTER (
        WHERE po.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
          AND po.status <> 'cancelled'
      ) AS orders_today,
      sum(po.total) FILTER (
        WHERE po.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
          AND po.status <> 'cancelled'
      ) AS revenue_today
    FROM public.pdv_orders po
    WHERE po.store_id = s.id
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT
      max(fi.created_at) AS last_invoice_at,
      (SELECT fi2.status FROM public.pdv_fiscal_invoices fi2
        WHERE fi2.store_id = s.id ORDER BY fi2.created_at DESC LIMIT 1) AS last_invoice_status,
      count(*) FILTER (
        WHERE fi.created_at >= now() - interval '24 hours'
          AND fi.status IN ('error', 'rejected')
      ) AS errors_24h
    FROM public.pdv_fiscal_invoices fi
    WHERE fi.store_id = s.id
  ) f ON true
  LEFT JOIN LATERAL (
    SELECT tc.provider, tc.environment, tc.is_active
    FROM public.pdv_tef_config tc
    WHERE tc.store_id = s.id
    ORDER BY tc.is_active DESC, tc.updated_at DESC
    LIMIT 1
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT
      max(tt.created_at) AS last_tef_at,
      (SELECT tt2.status FROM public.pdv_tef_transactions tt2
        WHERE tt2.store_id = s.id ORDER BY tt2.created_at DESC LIMIT 1) AS last_tef_status,
      count(*) FILTER (
        WHERE tt.created_at >= now() - interval '24 hours'
          AND tt.status IN ('error', 'declined')
      ) AS errors_24h
    FROM public.pdv_tef_transactions tt
    WHERE tt.store_id = s.id
  ) x ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS printers_active
    FROM public.pdv_printers pr
    WHERE pr.store_id = s.id AND pr.is_active
  ) p ON true
  WHERE s.is_active
    AND COALESCE(s.is_virtual, false) = false
    AND s.store_type = 'loja'::public.store_type
    -- só pontos de venda de fato: com maquininha configurada ou com pedidos já registrados
    AND (t.provider IS NOT NULL OR o.last_order_at IS NOT NULL)
    AND (
      public.is_super_user((SELECT auth.uid()))
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
    )
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION public.operational_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_health() TO service_role;