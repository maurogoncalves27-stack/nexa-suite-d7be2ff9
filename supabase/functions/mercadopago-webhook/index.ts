// Recebe webhook do Mercado Pago e confirma pdv_order quando pagamento aprovado.
// deploy: force redeploy
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatchDelivery } from '../_shared/delivery/service.ts';
import type { DeliveryAddress } from '../_shared/delivery/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '';
const MP_WEBHOOK_SECRETS = [
  Deno.env.get('MERCADO_PAGO_PROD_WEBHOOK_SECRET') || '',
  Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') || '',
  Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET') || '',
].filter(Boolean);
const MP_WEBHOOK_SECRET = MP_WEBHOOK_SECRETS[0] || '';

const ZAPI_INSTANCE = Deno.env.get('ZAPI_CUSTOMER_INSTANCE_ID') || '';
const ZAPI_TOKEN = Deno.env.get('ZAPI_CUSTOMER_TOKEN') || '';
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CUSTOMER_CLIENT_TOKEN') || '';

const SITE_ORIGIN = Deno.env.get('SITE_PUBLIC_ORIGIN') || 'https://www.aquelaparme.com.br';
// Minutos de preparo assumidos quando a loja não tem ETA configurado.
const DEFAULT_PREP_MINUTES = 30;

async function sendWhatsApp(phone: string, message: string) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) return;
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone, message }),
  }).catch((e) => console.error('zapi send err', e));
}

// Valida x-signature do Mercado Pago (HMAC-SHA256).
// Formato do header: "ts=<timestamp>,v1=<hex_hmac>"
// Manifest assinado: "id:<data.id>;request-id:<x-request-id>;ts:<timestamp>;"
async function verifyMpSignature(
  req: Request,
  url: URL,
  dataId: string | null,
): Promise<boolean> {
  if (MP_WEBHOOK_SECRETS.length === 0) return false;
  const sigHeader = req.headers.get('x-signature') || '';
  const requestId = req.headers.get('x-request-id') || '';
  if (!sigHeader || !dataId) return false;

  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k.trim(), rest.join('=').trim()];
    }),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  for (const secret of MP_WEBHOOK_SECRETS) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
    const hex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hex.length === v1.length) {
      let diff = 0;
      for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
      if (diff === 0) return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    console.log('[mp-webhook] body', JSON.stringify(body).slice(0, 400));

    const isMercadoPagoTestPing =
      body?.live_mode === false &&
      String(body?.data?.id || body?.id || '') === '123456' &&
      String(body?.type || '') === 'payment';

    if (isMercadoPagoTestPing) {
      return new Response(JSON.stringify({ ok: true, skipped: 'mercadopago_test_ping' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrai id pra validar assinatura antes de qualquer chamada externa
    const sigDataId =
      String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '');

    if (!MP_WEBHOOK_SECRET) {
      console.error('[mp-webhook] MERCADOPAGO_WEBHOOK_SECRET not configured');
      return new Response(JSON.stringify({ error: 'webhook_secret_not_configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const valid = await verifyMpSignature(req, url, sigDataId);
    if (!valid) {
      console.warn('[mp-webhook] invalid signature');
      return new Response(JSON.stringify({ error: 'invalid_signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const type = body?.type || body?.action?.split('.')[0] || url.searchParams.get('type');
    const paymentId =
      body?.data?.id ||
      body?.resource?.split('/').pop() ||
      url.searchParams.get('data.id') ||
      url.searchParams.get('id');

    if (type !== 'payment' && !paymentId) {
      return new Response(JSON.stringify({ ok: true, skipped: 'not a payment event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!MP_TOKEN) {
      return new Response(JSON.stringify({ error: 'MP token missing' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // sempre re-consulta o pagamento
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    const payment = await mpResp.json();
    if (!mpResp.ok) {
      console.error('[mp-webhook] mp fetch err', mpResp.status, payment);
      // Test pings do Mercado Pago usam data.id fake (ex: 123456) — responder 200 pra simulador aceitar
      if (mpResp.status === 404 || mpResp.status === 401 || body?.live_mode === false) {
        return new Response(JSON.stringify({ ok: true, skipped: 'mp_fetch_failed', mp_status: mpResp.status }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'mp_fetch_failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orderId = payment?.external_reference;
    const status = payment?.status; // approved, pending, rejected, refunded, cancelled
    if (!orderId) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no external_reference' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: order } = await supabase
      .from('pdv_orders')
      .select(
        'id, status, store_id, customer_phone, customer_name, order_number, total, order_type, source, delivery_address, delivery_job_id',
      )
      .eq('id', orderId)
      .maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ ok: true, skipped: 'order not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualiza pdv_payments (match por external_payment_id == preference_id ou payment_id)
    await supabase.from('pdv_payments').update({
      external_payment_id: String(payment.id),
    }).eq('order_id', orderId).eq('method', 'online');

    let newOrderStatus = order.status;
    if (status === 'approved' && order.status !== 'confirmed' && order.status !== 'concluded') {
      newOrderStatus = 'confirmed';
      await supabase.from('pdv_orders').update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      }).eq('id', orderId);

      // marca cart como pago
      await supabase.from('pdv_whatsapp_carts').update({ status: 'paid' })
        .eq('pdv_order_id', orderId);

      // Pagamento aprovado aciona loja e entregador ao mesmo tempo.
      const dispatch = await dispatchPaidDelivery(supabase, order);

      // mensagem ao cliente
      if (order.customer_phone) {
        await sendWhatsApp(order.customer_phone, buildCustomerMessage(order, dispatch));
      }
    } else if (status === 'rejected' || status === 'cancelled') {
      await supabase.from('pdv_whatsapp_carts').update({ status: 'cancelled' })
        .eq('pdv_order_id', orderId);
    }

    await supabase.from('pdv_order_events').insert({
      order_id: orderId,
      store_id: order.store_id,
      source: 'mercadopago',
      event_code: `payment.${status}`,
      external_event_id: String(payment.id),
      previous_status: order.status,
      new_status: newOrderStatus,
      payload: payment,
    });

    return new Response(JSON.stringify({ ok: true, status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[mp-webhook] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

type PaidOrder = {
  id: string;
  store_id: string;
  order_number: string | null;
  total: number | null;
  order_type: string | null;
  source: string | null;
  customer_name: string | null;
  delivery_address: Record<string, unknown> | null;
  delivery_job_id: string | null;
};

type DispatchOutcome = {
  ok: boolean;
  skipped?: string;
  tracking_url?: string | null;
  error?: string;
};

function hasCoords(a: Record<string, unknown> | null): a is Record<string, unknown> {
  return !!a && typeof a.latitude === 'number' && typeof a.longitude === 'number';
}

/**
 * Aciona a corrida logo após o pagamento. O entregador é agendado para o fim do
 * preparo (scheduleAt) para não chegar antes de o pedido estar pronto.
 * Falha aqui nunca invalida o pagamento: registra o evento e deixa a loja
 * despachar manualmente pelo painel de entregas.
 */
async function dispatchPaidDelivery(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: PaidOrder,
): Promise<DispatchOutcome> {
  if (order.order_type !== 'delivery') return { ok: false, skipped: 'not_delivery' };
  if (order.delivery_job_id) return { ok: false, skipped: 'already_dispatched' };

  if (!hasCoords(order.delivery_address)) {
    console.warn('[mp-webhook] delivery order without coordinates', order.id);
    await logDeliveryEvent(supabase, order, 'delivery.dispatch_skipped', {
      reason: 'missing_coordinates',
    });
    return { ok: false, error: 'missing_coordinates' };
  }

  const { data: ecomStore } = await supabase
    .from('ecommerce_stores')
    .select('min_pickup_minutes')
    .eq('store_id', order.store_id)
    .maybeSingle();

  const prepMinutes = Number(ecomStore?.min_pickup_minutes) || DEFAULT_PREP_MINUTES;
  const scheduleAt = new Date(Date.now() + prepMinutes * 60_000).toISOString();

  try {
    const result = await dispatchDelivery(supabase, {
      order_id: order.id,
      store_id: order.store_id,
      dropoff: order.delivery_address as unknown as DeliveryAddress,
      order_value_cents: Math.round(Number(order.total ?? 0) * 100),
      schedule_at: scheduleAt,
      // O frete já foi cobrado do cliente no checkout; o custo real fica no job.
      update_order_fee: false,
    });

    if (!result.ok) {
      await registerFailedDispatch(supabase, order, result.last_error ?? result.error);
      return { ok: false, error: result.last_error ?? result.error };
    }

    await logDeliveryEvent(supabase, order, 'delivery.dispatched', {
      provider: result.provider,
      job_id: result.job_id,
      provider_order_id: result.result.order_id,
      schedule_at: scheduleAt,
    });

    return { ok: true, tracking_url: result.result.tracking_url ?? null };
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    console.error('[mp-webhook] dispatch error', message);
    await registerFailedDispatch(supabase, order, message);
    return { ok: false, error: message };
  }
}

// Deixa a falha visível no painel de entregas para retry manual.
async function registerFailedDispatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: PaidOrder,
  message: string,
) {
  // Atribui a falha ao provedor primário da loja para não inventar provider.
  const { data: primary } = await supabase
    .from('delivery_provider_config')
    .select('provider')
    .eq('store_id', order.store_id)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primary?.provider) {
    const { error } = await supabase.from('delivery_jobs').insert({
      order_id: order.id,
      store_id: order.store_id,
      provider: primary.provider,
      status: 'failed',
      dropoff_address: order.delivery_address,
      error_message: message.slice(0, 500),
      requested_at: new Date().toISOString(),
    });
    if (error) console.error('[mp-webhook] failed job insert', error);
  }

  await logDeliveryEvent(supabase, order, 'delivery.dispatch_failed', { error: message });
}

async function logDeliveryEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  order: PaidOrder,
  eventCode: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from('pdv_order_events').insert({
    order_id: order.id,
    store_id: order.store_id,
    source: 'delivery',
    event_code: eventCode,
    previous_status: 'confirmed',
    new_status: 'confirmed',
    payload,
  });
  if (error) console.error('[mp-webhook] event log failed', error);
}

function buildCustomerMessage(order: PaidOrder, dispatch: DispatchOutcome) {
  const ref = order.order_number ? ` #${order.order_number}` : '';
  const statusLink = order.source === 'site' ? `\n\nAcompanhe: ${SITE_ORIGIN}/pedir/pedido/${order.id}` : '';

  if (order.order_type !== 'delivery') {
    return `✅ Pagamento confirmado! Seu pedido${ref} foi enviado para a cozinha. Avisamos assim que estiver pronto para retirada 🍽️${statusLink}`;
  }
  if (dispatch.ok) {
    return `✅ Pagamento confirmado! Seu pedido${ref} foi para a cozinha e já chamamos um entregador 🛵${statusLink}`;
  }
  return `✅ Pagamento confirmado! Seu pedido${ref} foi para a cozinha. Estamos organizando a entrega e te avisamos assim que o entregador estiver a caminho 🛵${statusLink}`;
}
