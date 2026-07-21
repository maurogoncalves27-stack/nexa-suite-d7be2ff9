// Valida um código Yolo Club sem consumir (chamado antes de aplicar desconto no carrinho).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  code: z.string().trim().min(3).max(64),
  store_id: z.string().uuid(),
  channel: z.enum(['totem', 'garcom', 'online', 'pdv']),
  cart_total_cents: z.number().int().nonnegative().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ valid: false, reason: 'invalid_request', errors: parsed.error.flatten().fieldErrors }, 400);
    }
    const { code, store_id, channel, cart_total_cents } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: config } = await supabase
      .from('yolo_config')
      .select('*')
      .eq('enabled', true)
      .maybeSingle();

    if (!config) {
      return json({ valid: false, reason: 'integration_disabled', message: 'Integração Yolo desabilitada' }, 503);
    }

    const apiKey = Deno.env.get('YOLO_API_KEY');
    if (!apiKey) {
      return json({ valid: false, reason: 'missing_credentials', message: 'YOLO_API_KEY não configurada' }, 500);
    }

    const yoloStoreId = (config.store_mapping as Record<string, string>)?.[store_id] ?? store_id;

    const upstream = await fetch(`${config.base_url}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        partner_id: config.partner_id,
        store_id: yoloStoreId,
        channel,
        cart_total_cents,
      }),
    });

    const body = await upstream.json().catch(() => ({}));

    // Log auditoria (não bloqueia resposta)
    supabase.from('yolo_vouchers_used').insert({
      code,
      voucher_id: body?.voucher_id ?? null,
      store_id,
      channel,
      status: upstream.ok && body?.valid ? 'validated' : 'failed',
      benefit_snapshot: body?.benefit ?? null,
      failure_reason: !upstream.ok || !body?.valid ? (body?.reason ?? `http_${upstream.status}`) : null,
      raw_response: body,
    }).then(() => {});

    return json(body, upstream.status);
  } catch (err) {
    console.error('yolo-validate error:', err);
    return json({ valid: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
