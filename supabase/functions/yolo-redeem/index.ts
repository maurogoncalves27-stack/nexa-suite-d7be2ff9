// Confirma/ativa o voucher Yolo após o pedido ser fechado/pago. Idempotente por order_id+code.
// Segundo endpoint do modelo Yolo: "ativação mesmo, o status de confirmação dele".
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { loadYoloContext, serviceClient, yoloHeaders, yoloUrl, jsonResponse } from '../_shared/yolo.ts';

const BodySchema = z.object({
  voucher_id: z.string().min(1).optional(),
  code: z.string().trim().min(3).max(64),
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

    const supabase = serviceClient();

    // Idempotência local: já confirmamos esse código pra esse pedido?
    const { data: existing } = await supabase
      .from('yolo_vouchers_used')
      .select('id')
      .eq('order_id', p.order_id)
      .eq('code', p.code)
      .eq('status', 'redeemed')
      .maybeSingle();

    if (existing) {
      return json({ redeemed: true, already: true, voucher_id: p.voucher_id ?? null }, 200);
    }

    const { ctx, error } = await loadYoloContext(supabase, p.store_id);
    if (!ctx) return json({ redeemed: false, reason: error!.reason, message: error!.message }, error!.status);

    const upstream = await fetch(yoloUrl(ctx, ctx.config.confirm_path), {
      method: 'POST',
      headers: yoloHeaders(ctx, p.code),
      body: JSON.stringify({
        code: p.code,
        voucher_id: p.voucher_id ?? null,
        partner_id: ctx.config.partner_id,
        branch_id: ctx.branchId,
        order_id: p.order_id,
        cart_total_cents: p.order_total_cents,
        discount_cents: p.discount_applied_cents,
        confirmed_at: new Date().toISOString(),
      }),
    });

    const body = await upstream.json().catch(() => ({}));
    const ok = upstream.ok && body?.confirmed !== false && body?.redeemed !== false;

    await supabase.from('yolo_vouchers_used').insert({
      code: p.code,
      voucher_id: p.voucher_id ?? body?.voucher_id ?? null,
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
  return jsonResponse(data, status, corsHeaders);
}
