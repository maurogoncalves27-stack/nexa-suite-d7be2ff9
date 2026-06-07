// Cria preferência de pagamento no Mercado Pago para um pdv_order.
// Input: { pdv_order_id }
// Output: { init_point, qr_code, qr_code_base64 }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!SERVICE_ROLE || token !== SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!MP_TOKEN) {
    return new Response(JSON.stringify({ error: 'MERCADOPAGO_ACCESS_TOKEN not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { pdv_order_id } = await req.json();
    if (!pdv_order_id) {
      return new Response(JSON.stringify({ error: 'pdv_order_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: order } = await supabase
      .from('pdv_orders')
      .select('id, total, customer_name, customer_phone, store_id, pdv_order_items:pdv_order_items(name, quantity, unit_price)')
      .eq('id', pdv_order_id)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ error: 'order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/mercadopago-webhook`;

    const items = (order.pdv_order_items || []).map((it: any) => ({
      title: String(it.name || 'Item').slice(0, 250),
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      currency_id: 'BRL',
    }));

    const preferenceBody = {
      items: items.length ? items : [{ title: 'Pedido', quantity: 1, unit_price: Number(order.total) || 0, currency_id: 'BRL' }],
      external_reference: order.id,
      notification_url: webhookUrl,
      payer: {
        name: order.customer_name || undefined,
        phone: order.customer_phone ? { number: order.customer_phone } : undefined,
      },
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
        installments: 3,
      },
      back_urls: {
        success: `${SUPABASE_URL}/functions/v1/mercadopago-webhook?cb=ok`,
        failure: `${SUPABASE_URL}/functions/v1/mercadopago-webhook?cb=fail`,
        pending: `${SUPABASE_URL}/functions/v1/mercadopago-webhook?cb=pending`,
      },
      auto_return: 'approved',
    };

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MP_TOKEN}` },
      body: JSON.stringify(preferenceBody),
    });
    const mpData = await mpResp.json();
    if (!mpResp.ok) {
      console.error('[mp-create-link] MP error', mpResp.status, mpData);
      return new Response(JSON.stringify({ error: 'mp_error', detail: mpData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const initPoint = mpData.init_point || mpData.sandbox_init_point;

    // Salva registro de pagamento pendente
    await supabase.from('pdv_payments').insert({
      order_id: order.id,
      method: 'online',
      amount: Number(order.total) || 0,
      external_payment_id: String(mpData.id || ''),
    });

    return new Response(JSON.stringify({
      ok: true,
      init_point: initPoint,
      preference_id: mpData.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[mp-create-link] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
