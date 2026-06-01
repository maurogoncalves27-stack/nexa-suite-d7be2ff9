// delivery-webhook-lalamove — recebe push de status da Lalamove.
// Público (verify_jwt=false). Valida assinatura HMAC (TODO Fase 1).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Mapeia status Lalamove -> status interno
const STATUS_MAP: Record<string, string> = {
  ASSIGNING_DRIVER: 'requested',
  ON_GOING: 'assigned',
  PICKED_UP: 'picked_up',
  COMPLETED: 'delivered',
  CANCELED: 'cancelled',
  REJECTED: 'failed',
  EXPIRED: 'expired',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const payload = await req.json();
    console.log('[lalamove-webhook]', JSON.stringify(payload).slice(0, 500));

    // TODO Fase 1: validar HMAC com LALAMOVE_API_SECRET
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const providerOrderId = payload?.data?.order?.orderId ?? payload?.orderId;
    const externalStatus = payload?.data?.order?.status ?? payload?.status;

    if (!providerOrderId) {
      return new Response(JSON.stringify({ ok: false, reason: 'missing orderId' }), { headers: corsHeaders });
    }

    const { data: job } = await supabase.from('delivery_jobs')
      .select('id, status').eq('provider', 'lalamove').eq('provider_order_id', providerOrderId).maybeSingle();

    if (!job) {
      console.warn('[lalamove-webhook] job not found', providerOrderId);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }

    await supabase.from('delivery_job_events').insert({
      job_id: job.id, provider: 'lalamove',
      event_type: externalStatus ?? 'unknown',
      payload,
    });

    const newStatus = externalStatus ? STATUS_MAP[externalStatus] ?? null : null;
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
    console.error('[lalamove-webhook] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
