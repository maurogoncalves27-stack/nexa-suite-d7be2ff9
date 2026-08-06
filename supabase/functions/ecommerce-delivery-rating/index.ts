// ecommerce-delivery-rating — avaliação da entrega pelo cliente.
// Pública (anon), autorizada pelo token derivado do id do pedido.
//
// GET  ?order_id=<uuid>&token=<hex>            → dados para montar a tela
// POST { action: 'load', order_id, token }      → idem, usado pelo front
// POST { action: 'save', order_id, token, rating: 1..5, comment? }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyRatingToken } from '../_shared/delivery/ratingToken.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let orderId = url.searchParams.get('order_id') ?? '';
    let token = url.searchParams.get('token') ?? '';
    let rating: number | null = null;
    let comment: string | null = null;
    let isSave = false;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      orderId = String(body?.order_id ?? orderId);
      token = String(body?.token ?? token);
      isSave = body?.action !== 'load';
      if (isSave) {
        rating = Number(body?.rating);
        comment = body?.comment ? String(body.comment).slice(0, 1000) : null;
      }
    } else if (req.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    if (!orderId) return json({ error: 'order_id required' }, 400);
    if (!(await verifyRatingToken(orderId, token))) return json({ error: 'invalid_token' }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: order } = await supabase
      .from('pdv_orders')
      .select('id, store_id, order_number, status, order_type, customer_name, delivery_job_id, delivery_provider')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return json({ error: 'not_found' }, 404);
    if (order.order_type !== 'delivery') return json({ error: 'not_a_delivery' }, 409);

    const { data: store } = await supabase
      .from('ecommerce_stores')
      .select('display_name')
      .eq('store_id', order.store_id)
      .maybeSingle();

    const { data: existing } = await supabase
      .from('delivery_ratings')
      .select('rating, comment, created_at')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!isSave) {
      return json({
        ok: true,
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          customer_name: order.customer_name,
          store_name: store?.display_name ?? null,
          delivered: order.status === 'concluded',
        },
        rating: existing ?? null,
      });
    }

    if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
      return json({ error: 'invalid_rating' }, 400);
    }
    // A avaliação só faz sentido depois da entrega concluída.
    if (order.status !== 'concluded') return json({ error: 'delivery_not_completed' }, 409);

    const { error } = await supabase.from('delivery_ratings').upsert(
      {
        order_id: order.id,
        job_id: order.delivery_job_id ?? null,
        store_id: order.store_id,
        provider: order.delivery_provider ?? null,
        rating,
        comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'order_id' },
    );
    if (error) {
      console.error('[delivery-rating] upsert err', error);
      return json({ error: 'save_failed', detail: error.message }, 500);
    }

    await supabase.from('pdv_order_events').insert({
      order_id: order.id,
      store_id: order.store_id,
      source: 'customer',
      event_code: 'delivery.rated',
      previous_status: order.status,
      new_status: order.status,
      payload: { rating, comment },
    });

    return json({ ok: true, rating, comment });
  } catch (e) {
    console.error('[delivery-rating] error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
