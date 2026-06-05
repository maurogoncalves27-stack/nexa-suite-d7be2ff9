// delivery-webhook-uber — recebe push de status do Uber Direct.
// Público (verify_jwt=false). Valida assinatura X-Postmates-Signature (TODO Fase 2).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const STATUS_MAP: Record<string, string> = {
  pending: 'requested',
  pickup: 'assigned',
  pickup_complete: 'picked_up',
  dropoff: 'picked_up',
  delivered: 'delivered',
  canceled: 'cancelled',
  returned: 'cancelled',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Shared-secret check (interim until full HMAC X-Postmates-Signature). If
  // UBER_DIRECT_WEBHOOK_SECRET is not configured, endpoint stays closed (503).
  const expectedSecret = Deno.env.get('UBER_DIRECT_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: 'webhook secret not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const provided = req.headers.get('x-webhook-secret') ?? req.headers.get('x-postmates-signature') ?? '';
  if (provided !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();
    console.log('[uber-webhook]', JSON.stringify(payload).slice(0, 500));

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const providerOrderId = payload?.data?.id ?? payload?.delivery_id ?? payload?.id;
    const externalStatus = payload?.data?.status ?? payload?.status ?? payload?.kind;

    if (!providerOrderId) {
      return new Response(JSON.stringify({ ok: false, reason: 'missing delivery id' }), { headers: corsHeaders });
    }

    const { data: job } = await supabase.from('delivery_jobs')
      .select('id, status').eq('provider', 'uber_direct').eq('provider_order_id', providerOrderId).maybeSingle();

    if (!job) {
      console.warn('[uber-webhook] job not found', providerOrderId);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }

    await supabase.from('delivery_job_events').insert({
      job_id: job.id, provider: 'uber_direct',
      event_type: String(externalStatus ?? 'unknown'),
      payload,
    });

    const newStatus = externalStatus ? STATUS_MAP[String(externalStatus)] ?? null : null;
    if (newStatus && newStatus !== job.status) {
      const ts: Record<string, string> = {};
      if (newStatus === 'picked_up') ts.picked_up_at = new Date().toISOString();
      if (newStatus === 'delivered') ts.delivered_at = new Date().toISOString();
      if (newStatus === 'cancelled') ts.cancelled_at = new Date().toISOString();
      await supabase.from('delivery_jobs').update({ status: newStatus, ...ts }).eq('id', job.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[uber-webhook] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
