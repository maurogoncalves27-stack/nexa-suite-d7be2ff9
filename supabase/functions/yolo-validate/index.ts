// Pré-valida um código Yolo Club sem consumir (chamado antes de aplicar desconto no carrinho).
// Guia oficial: GET /integracao/consultar-token?codigo=XXXXXX
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { loadYoloContext, serviceClient, yoloHeaders, yoloUrl, jsonResponse, toYoloMoney } from '../_shared/yolo.ts';

const BodySchema = z.object({
  code: z.string().trim().length(6).regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
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

    const upstream = await fetch(`${yoloUrl(ctx, '/integracao/consultar-token')}?${new URLSearchParams({ codigo: code })}`, {
      method: 'GET',
      headers: yoloHeaders(ctx),
    });

    const body = await upstream.json().catch(() => ({}));
    const isValid = upstream.ok && body?.error === false && body?.data?.valido === true;

    // Log auditoria (não bloqueia resposta)
    supabase.from('yolo_vouchers_used').insert({
      code,
      voucher_id: null,
      store_id,
      channel,
      status: isValid ? 'validated' : 'failed',
      benefit_snapshot: body?.data ?? null,
      order_total_cents: cart_total_cents ?? null,
      discount_applied_cents: discount_cents ?? null,
      failure_reason: !isValid ? (body?.message ?? `http_${upstream.status}`) : null,
      raw_response: body,
    }).then(() => {});

    // Resposta compatível com o restante do sistema NEXA
    return json({
      valid: isValid,
      yolo_valid: isValid,
      message: body?.message ?? null,
      raw: body,
    }, upstream.status);
  } catch (err) {
    console.error('yolo-validate error:', err);
    return json({ valid: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return jsonResponse(data, status, corsHeaders);
}
