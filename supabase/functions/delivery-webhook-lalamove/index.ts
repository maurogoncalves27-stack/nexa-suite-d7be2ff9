// delivery-webhook-lalamove — recebe push de status da Lalamove.
// Público (verify_jwt=false); a autenticação é o shared secret configurado em
// LALAMOVE_WEBHOOK_SECRET, aceito por header ou na query string da URL
// registrada no Partner Portal (que não permite headers customizados).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ZAPI_INSTANCE = Deno.env.get('ZAPI_CUSTOMER_INSTANCE_ID') || '';
const ZAPI_TOKEN = Deno.env.get('ZAPI_CUSTOMER_TOKEN') || '';
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CUSTOMER_CLIENT_TOKEN') || '';

const SITE_ORIGIN = Deno.env.get('SITE_PUBLIC_ORIGIN') || 'https://www.aquelaparme.com.br';

// Mapeia status Lalamove -> status interno do delivery_job
const STATUS_MAP: Record<string, string> = {
  ASSIGNING_DRIVER: 'requested',
  ON_GOING: 'assigned',
  PICKED_UP: 'picked_up',
  COMPLETED: 'delivered',
  CANCELED: 'cancelled',
  REJECTED: 'failed',
  EXPIRED: 'expired',
};

// Status do pedido na loja que cada etapa da corrida implica.
const ORDER_STATUS_BY_JOB: Record<string, string> = {
  picked_up: 'dispatched',
  delivered: 'concluded',
};

// Caminho da máquina de estados até o status desejado (pdv_advance_order_status
// só aceita um passo por vez).
const ORDER_FLOW = ['placed', 'confirmed', 'preparing', 'ready', 'dispatched', 'concluded'];

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendWhatsApp(phone: string, message: string) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !phone) return;
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone, message }),
  }).catch((e) => console.error('[lalamove-webhook] zapi send err', e));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Sem secret configurado o endpoint fica fechado, para não aceitar evento forjado.
  const expectedSecret = Deno.env.get('LALAMOVE_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return json({ error: 'webhook secret not configured' }, 503);
  }

  const url = new URL(req.url);
  const provided =
    req.headers.get('x-webhook-secret') ??
    req.headers.get('x-lalamove-signature') ??
    url.searchParams.get('secret') ??
    url.searchParams.get('token') ??
    '';
  if (!timingSafeEqual(provided, expectedSecret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const payload = await req.json();
    console.log('[lalamove-webhook]', JSON.stringify(payload).slice(0, 500));

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const orderData = payload?.data?.order ?? {};
    const providerOrderId = orderData.orderId ?? payload?.orderId;
    const externalStatus = orderData.status ?? payload?.status;
    const eventType = payload?.eventType ?? payload?.event ?? externalStatus ?? 'unknown';
    const driver = payload?.data?.driver ?? {};

    if (!providerOrderId) {
      return json({ ok: false, reason: 'missing orderId' });
    }

    const { data: job } = await supabase
      .from('delivery_jobs')
      .select('id, status, order_id, store_id, tracking_url')
      .eq('provider', 'lalamove')
      .eq('provider_order_id', providerOrderId)
      .maybeSingle();

    if (!job) {
      console.warn('[lalamove-webhook] job not found', providerOrderId);
      return json({ ok: true, skipped: true });
    }

    await supabase.from('delivery_job_events').insert({
      job_id: job.id,
      provider: 'lalamove',
      event_type: String(eventType),
      payload,
    });

    const newStatus = externalStatus ? STATUS_MAP[externalStatus] ?? null : null;
    const trackingUrl = orderData.shareLink ?? job.tracking_url ?? null;
    const driverName = driver.name ?? null;
    const driverPhone = driver.phone ?? null;

    const jobPatch: Record<string, unknown> = {};
    if (trackingUrl && trackingUrl !== job.tracking_url) jobPatch.tracking_url = trackingUrl;
    if (driverName) jobPatch.driver_name = driverName;
    if (driverPhone) jobPatch.driver_phone = driverPhone;

    if (newStatus && newStatus !== job.status) {
      jobPatch.status = newStatus;
      const now = new Date().toISOString();
      if (newStatus === 'picked_up') jobPatch.picked_up_at = now;
      if (newStatus === 'delivered') jobPatch.delivered_at = now;
      if (newStatus === 'cancelled') jobPatch.cancelled_at = now;
    }

    if (Object.keys(jobPatch).length > 0) {
      await supabase.from('delivery_jobs').update(jobPatch).eq('id', job.id);
    }

    if (job.order_id) {
      await syncOrder(supabase, {
        orderId: job.order_id,
        jobStatus: newStatus && newStatus !== job.status ? newStatus : null,
        trackingUrl,
        driverName,
        driverPhone,
        externalStatus: String(externalStatus ?? ''),
        payload,
      });
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[lalamove-webhook] error', e);
    return json({ error: String(e) }, 500);
  }
});

/** Reflete a corrida no pedido da loja: rastreio, entregador e status. */
async function syncOrder(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: {
    orderId: string;
    jobStatus: string | null;
    trackingUrl: string | null;
    driverName: string | null;
    driverPhone: string | null;
    externalStatus: string;
    payload: unknown;
  },
) {
  const { data: order } = await supabase
    .from('pdv_orders')
    .select('id, status, store_id, source, order_number, customer_phone, delivery_tracking_url')
    .eq('id', args.orderId)
    .maybeSingle();
  if (!order) return;

  if (args.trackingUrl && args.trackingUrl !== order.delivery_tracking_url) {
    await supabase
      .from('pdv_orders')
      .update({ delivery_tracking_url: args.trackingUrl })
      .eq('id', order.id);
  }

  // Corrida cancelada/expirada não cancela o pedido: a comida já foi paga e
  // possivelmente preparada. Fica o registro para a loja reagir.
  if (args.jobStatus && ['cancelled', 'failed', 'expired'].includes(args.jobStatus)) {
    await supabase.from('pdv_order_events').insert({
      order_id: order.id,
      store_id: order.store_id,
      source: 'lalamove',
      event_code: `delivery.${args.jobStatus}`,
      previous_status: order.status,
      new_status: order.status,
      payload: args.payload as Record<string, unknown>,
    });
    return;
  }

  const target = args.jobStatus ? ORDER_STATUS_BY_JOB[args.jobStatus] : null;
  if (!target) return;

  const advanced = await advanceOrderTo(supabase, order.id, order.status, target, args);
  if (!advanced) return;

  if (order.customer_phone) {
    const ref = order.order_number ? ` #${order.order_number}` : '';
    const link = order.source === 'site' ? `\n\nAcompanhe: ${SITE_ORIGIN}/pedir/pedido/${order.id}` : '';
    if (target === 'dispatched') {
      const who = args.driverName ? ` com ${args.driverName}` : '';
      await sendWhatsApp(
        order.customer_phone,
        `🛵 Seu pedido${ref} saiu para entrega${who}!${link}`,
      );
    } else if (target === 'concluded') {
      await sendWhatsApp(order.customer_phone, `✅ Seu pedido${ref} foi entregue. Bom apetite!`);
    }
  }
}

/**
 * Caminha a máquina de estados até `target`. A corrida pode informar coleta
 * antes de a loja marcar "pronto", então os estados intermediários são
 * preenchidos para manter os timestamps coerentes.
 */
async function advanceOrderTo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orderId: string,
  currentStatus: string,
  target: string,
  args: { externalStatus: string; payload: unknown },
): Promise<boolean> {
  const from = ORDER_FLOW.indexOf(currentStatus);
  const to = ORDER_FLOW.indexOf(target);
  if (from < 0 || to < 0 || to <= from) return false;

  for (let i = from + 1; i <= to; i++) {
    const step = ORDER_FLOW[i];
    const { error } = await supabase.rpc('pdv_advance_order_status', {
      p_order_id: orderId,
      p_new_status: step,
      p_event_code: step === target ? `LALAMOVE_${args.externalStatus}` : `LALAMOVE_SYNC_${step.toUpperCase()}`,
      p_source: 'lalamove-webhook',
      p_payload: (step === target ? args.payload : {}) as Record<string, unknown>,
    });
    if (error) {
      console.error('[lalamove-webhook] advance failed', step, error);
      return false;
    }
  }
  return true;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
