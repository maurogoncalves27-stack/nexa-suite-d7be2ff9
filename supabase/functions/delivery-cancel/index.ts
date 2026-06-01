// delivery-cancel — cancela corrida no provedor.
// Body: { job_id: uuid }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAdapter, type ProviderName } from '../_shared/delivery/factory.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { job_id } = await req.json();
    if (!job_id) return json({ error: 'job_id required' }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: job } = await supabase.from('delivery_jobs').select('*').eq('id', job_id).maybeSingle();
    if (!job) return json({ error: 'job not found' }, 404);

    if (!job.provider_order_id) {
      // ainda não foi enviado ao provedor; basta marcar
      await supabase.from('delivery_jobs').update({
        status: 'cancelled', cancelled_at: new Date().toISOString(),
      }).eq('id', job_id);
      return json({ ok: true, message: 'cancelado localmente' });
    }

    const adapter = getAdapter(job.provider as ProviderName);
    const res = await adapter.cancel(job.provider_order_id);

    await supabase.from('delivery_jobs').update({
      status: res.ok ? 'cancelled' : job.status,
      cancelled_at: res.ok ? new Date().toISOString() : null,
      error_message: res.ok ? null : res.message ?? 'cancel failed',
    }).eq('id', job_id);

    return json({ ok: res.ok, message: res.message });
  } catch (e) {
    console.error('[delivery-cancel] error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
