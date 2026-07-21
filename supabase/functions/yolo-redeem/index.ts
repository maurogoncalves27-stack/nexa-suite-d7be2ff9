// Confirma o consumo do voucher Yolo após o pedido ser fechado/pago. Idempotente por order_id+voucher_id.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  voucher_id: z.string().min(1),
  code: z.string().min(3).max(64),
  store_id: z.string().uuid(),
  channel: z.enum(['totem', 'garcom', 'online', 'pdv']),
  order_id: z.string().min(1).max(128),
  order_total_cents: z.number().int().nonnegative(),
  discount_applied_cents: z.number().int().nonnegative(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ redeemed: false, reason: 'invalid_request', errors: parsed.error.flatten().fieldErrors }, 400);
    }
    const p = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotência local: já resgatamos esse voucher pra esse pedido?
    const { data: existing } = await supabase
      .from('yolo_vouchers_used')
      .select('id, status')
      .eq('order_id', p.order_id)
      .eq('voucher_id', p.voucher_id)
      .eq('status', 'redeemed')
      .maybeSingle();

    if (existing) {
      return json({ redeemed: true, already: true, voucher_id: p.voucher_id }, 200);
    }

    const { data: config } = await supabase
      .from('yolo_config')
      .select('*')
      .eq('enabled', true)
      .maybeSingle();

    if (!config) return json({ redeemed: false, reason: 'integration_disabled' }, 503);
    const apiKey = Deno.env.get('YOLO_API_KEY');
    if (!apiKey) return json({ redeemed: false, reason: 'missing_credentials' }, 500);

    const yoloStoreId = (config.store_mapping as Record<string, string>)?.[p.store_id] ?? p.store_id;

    const upstream = await fetch(`${config.base_url}/vouchers/redeem`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_id: p.voucher_id,
        code: p.code,
        partner_id: config.partner_id,
        store_id: yoloStoreId,
        order_id: p.order_id,
        order_total_cents: p.order_total_cents,
        discount_applied_cents: p.discount_applied_cents,
        redeemed_at: new Date().toISOString(),
      }),
    });

    const body = await upstream.json().catch(() => ({}));
    const ok = upstream.ok && (body?.redeemed === true || upstream.status === 200);

    await supabase.from('yolo_vouchers_used').insert({
      code: p.code,
      voucher_id: p.voucher_id,
      order_id: p.order_id,
      store_id: p.store_id,
      channel: p.channel,
      status: ok ? 'redeemed' : 'failed',
      discount_applied_cents: p.discount_applied_cents,
      order_total_cents: p.order_total_cents,
      failure_reason: ok ? null : (body?.reason ?? `http_${upstream.status}`),
      raw_response: body,
    });

    return json(body, upstream.status);
  } catch (err) {
    console.error('yolo-redeem error:', err);
    return json({ redeemed: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
