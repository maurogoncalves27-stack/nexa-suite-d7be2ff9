// Valida um código Yolo Club sem consumir (chamado antes de aplicar desconto no carrinho).
// Modelo Yolo: token POR FILIAL no header + code do usuário no header.
// Já enviamos aqui o valor economizado (desconto) e o total da comanda, conforme pedido pelo dev da Yolo.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { loadYoloContext, serviceClient, yoloHeaders, yoloUrl, jsonResponse } from '../_shared/yolo.ts';

const BodySchema = z.object({
  code: z.string().trim().min(3).max(64),
  store_id: z.string().uuid(),
  channel: z.enum(['totem', 'garcom', 'online', 'pdv']),
  cart_total_cents: z.number().int().nonnegative().optional(),
  discount_cents: z.number().int().nonnegative().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ valid: false, reason: 'invalid_request', errors: parsed.error.flatten().fieldErrors }, 400);
    }
    const { code, store_id, channel, cart_total_cents, discount_cents } = parsed.data;

    const supabase = serviceClient();
    const { ctx, error } = await loadYoloContext(supabase, store_id);
    if (!ctx) return json({ valid: false, reason: error!.reason, message: error!.message }, error!.status);

    const upstream = await fetch(yoloUrl(ctx, ctx.config.validate_path), {
      method: 'POST',
      headers: yoloHeaders(ctx, code),
      body: JSON.stringify({
        code,
        partner_id: ctx.config.partner_id,
        branch_id: ctx.branchId,
        channel,
        cart_total_cents: cart_total_cents ?? 0,
        // "valor economizado pelo cliente" + "total da comanda" já na validação
        discount_cents: discount_cents ?? 0,
      }),
    });

    const body = await upstream.json().catch(() => ({}));

    // Log auditoria (não bloqueia resposta)
    supabase.from('yolo_vouchers_used').insert({
      code,
      voucher_id: body?.voucher_id ?? null,
      store_id,
      channel,
      status: upstream.ok && body?.valid !== false ? 'validated' : 'failed',
      benefit_snapshot: body?.benefit ?? null,
      order_total_cents: cart_total_cents ?? null,
      discount_applied_cents: discount_cents ?? null,
      failure_reason: !upstream.ok || body?.valid === false ? (body?.reason ?? `http_${upstream.status}`) : null,
      raw_response: body,
    }).then(() => {});

    return json(body, upstream.status);
  } catch (err) {
    console.error('yolo-validate error:', err);
    return json({ valid: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return jsonResponse(data, status, corsHeaders);
}
