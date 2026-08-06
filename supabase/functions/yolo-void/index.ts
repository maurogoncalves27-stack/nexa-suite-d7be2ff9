// Estorno de voucher Yolo.
// A API oficial do Yolo Club (v1.0, 07/2026) NÃO possui endpoint de estorno.
// Esta function mantém apenas o log local para conciliação manual e retorna 501.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { loadYoloContext, serviceClient, jsonResponse } from '../_shared/yolo.ts';

const BodySchema = z.object({
  code: z.string().trim().length(6).regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
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
    const { error } = await loadYoloContext(supabase, p.store_id);
    if (error) return json({ voided: false, reason: error.reason, message: error.message }, error.status);

    // Log local para conciliação manual; a Yolo não fornece endpoint de estorno.
    await supabase.from('yolo_vouchers_used').insert({
      code: p.code,
      voucher_id: null,
      order_id: p.order_id,
      store_id: p.store_id,
      channel: p.channel,
      status: 'voided',
      failure_reason: p.reason ?? 'order_cancelled',
      raw_response: { note: 'Yolo API v1.0 does not expose a void endpoint' },
    });

    return json({
      voided: false,
      reason: 'not_supported_by_provider',
      message: 'A API Yolo Club não possui endpoint de estorno. Registro local mantido para conciliação.',
    }, 501);
  } catch (err) {
    console.error('yolo-void error:', err);
    return json({ voided: false, reason: 'internal_error', message: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return jsonResponse(data, status, corsHeaders);
}
