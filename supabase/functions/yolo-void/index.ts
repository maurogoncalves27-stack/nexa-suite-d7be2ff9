// Estorna um voucher Yolo previamente confirmado (usado quando o pedido é cancelado).
// Endpoint opcional no modelo da Yolo — se não existir lá, o log local serve para conciliação manual.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { loadYoloContext, serviceClient, yoloHeaders, yoloUrl, jsonResponse } from '../_shared/yolo.ts';

const BodySchema = z.object({
  voucher_id: z.string().min(1).optional(),
  code: z.string().trim().min(3).max(64),
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

    const supabase = serviceClient();
    const { ctx, error } = await loadYoloContext(supabase, p.store_id);
    if (!ctx) return json({ voided: false, reason: error!.reason, message: error!.message }, error!.status);

    const upstream = await fetch(yoloUrl(ctx, '/vouchers/void'), {
      method: 'POST',
      headers: yoloHeaders(ctx, p.code),
      body: JSON.stringify({
        code: p.code,
        voucher_id: p.voucher_id ?? null,
        partner_id: ctx.config.partner_id,
        branch_id: ctx.branchId,
        order_id: p.order_id,
        reason: p.reason ?? 'order_cancelled',
        voided_at: new Date().toISOString(),
      }),
    });

    const body = await upstream.json().catch(() => ({}));
    const ok = upstream.ok;

    await supabase.from('yolo_vouchers_used').insert({
      code: p.code,
      voucher_id: p.voucher_id ?? null,
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
  return jsonResponse(data, status, corsHeaders);
}
