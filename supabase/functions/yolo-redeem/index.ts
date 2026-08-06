// Consome/valida o voucher Yolo após o pedido ser fechado/pago. Idempotente por order_id+code.
// Guia oficial: POST /integracao/validar-token { Codigo, Valor, Economizou }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { loadYoloContext, serviceClient, yoloHeaders, yoloUrl, jsonResponse, toYoloMoney } from '../_shared/yolo.ts';

const BodySchema = z.object({
  code: z.string().trim().length(6).regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
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
      return json({ redeemed: true, already: true, code: p.code }, 200);
    }

    const { ctx, error } = await loadYoloContext(supabase, p.store_id);
    if (!ctx) return json({ redeemed: false, reason: error!.reason, message: error!.message }, error!.status);

    const upstream = await fetch(yoloUrl(ctx, '/integracao/validar-token'), {
      method: 'POST',
      headers: yoloHeaders(ctx),
      body: JSON.stringify({
        Codigo: p.code,
        Valor: toYoloMoney(p.order_total_cents),
        Economizou: toYoloMoney(p.discount_applied_cents),
      }),
    });

    const body = await upstream.json().catch(() => ({}));
    const ok = upstream.ok && body?.error === false && body?.data?.valido === true && body?.data?.TokenUtilizado === true;

    await supabase.from('yolo_vouchers_used').insert({
      code: p.code,
      voucher_id: null,
      order_id: p.order_id,
      store_id: p.store_id,
      channel: p.channel,
      status: ok ? 'redeemed' : 'failed',
      discount_applied_cents: p.discount_applied_cents,
      order_total_cents: p.order_total_cents,
      failure_reason: ok ? null : (body?.message ?? body?.data?.motivo ?? `http_${upstream.status}`),
      raw_response: body,
    });

    return json({
      redeemed: ok,
      code: p.code,
      message: body?.message ?? null,
      raw: body,
    }, upstream.status);
  } catch (err) {
    console.error('yolo-redeem error:', err);
    return json({ redeemed: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return jsonResponse(data, status, corsHeaders);
}
