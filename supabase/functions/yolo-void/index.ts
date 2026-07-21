// Estorna um voucher Yolo previamente resgatado (usado quando o pedido é cancelado).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  voucher_id: z.string().min(1),
  code: z.string().min(3).max(64),
  store_id: z.string().uuid(),
  channel: z.enum(['totem', 'garcom', 'online', 'pdv']),
  order_id: z.string().min(1).max(128),
  reason: z.string().max(240).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ voided: false, reason: 'invalid_request', errors: parsed.error.flatten().fieldErrors }, 400);
    }
    const p = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: config } = await supabase.from('yolo_config').select('*').eq('enabled', true).maybeSingle();
    if (!config) return json({ voided: false, reason: 'integration_disabled' }, 503);
    const apiKey = Deno.env.get('YOLO_API_KEY');
    if (!apiKey) return json({ voided: false, reason: 'missing_credentials' }, 500);

    const yoloStoreId = (config.store_mapping as Record<string, string>)?.[p.store_id] ?? p.store_id;

    const upstream = await fetch(`${config.base_url}/vouchers/void`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_id: p.voucher_id,
        code: p.code,
        partner_id: config.partner_id,
        store_id: yoloStoreId,
        order_id: p.order_id,
        reason: p.reason ?? 'order_cancelled',
        voided_at: new Date().toISOString(),
      }),
    });

    const body = await upstream.json().catch(() => ({}));
    const ok = upstream.ok;

    await supabase.from('yolo_vouchers_used').insert({
      code: p.code,
      voucher_id: p.voucher_id,
      order_id: p.order_id,
      store_id: p.store_id,
      channel: p.channel,
      status: ok ? 'voided' : 'failed',
      failure_reason: ok ? p.reason ?? 'order_cancelled' : (body?.reason ?? `http_${upstream.status}`),
      raw_response: body,
    });

    return json(body, upstream.status);
  } catch (err) {
    console.error('yolo-void error:', err);
    return json({ voided: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
