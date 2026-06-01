// delivery-dispatch — solicita corrida no provedor (primário ou específico).
// Body: { order_id?: uuid, store_id: uuid, provider?: 'lalamove'|'uber_direct'|'mock',
//         dropoff: DeliveryAddress, quote_id?: string, order_value_cents?: number }
// Cria delivery_jobs e atualiza pdv_orders (se order_id).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAdapter, isProviderConfigured, type ProviderName } from '../_shared/delivery/factory.ts';
import type { DeliveryAddress } from '../_shared/delivery/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { order_id, store_id, provider, dropoff, quote_id, order_value_cents } = body as {
      order_id?: string;
      store_id?: string;
      provider?: ProviderName;
      dropoff?: DeliveryAddress;
      quote_id?: string;
      order_value_cents?: number;
    };

    if (!store_id || !dropoff) {
      return json({ error: 'store_id and dropoff required' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Lista de provedores ordenada por prioridade
    const { data: configs } = await supabase
      .from('delivery_provider_config')
      .select('provider, priority, pickup_address, service_type')
      .eq('store_id', store_id)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (!configs || configs.length === 0) {
      return json({ error: 'no active providers' }, 404);
    }

    const candidates = provider
      ? configs.filter((c) => c.provider === provider)
      : configs;

    if (candidates.length === 0) {
      return json({ error: `provider ${provider} not active for this store` }, 404);
    }

    const { data: store } = await supabase.from('stores').select('name, address').eq('id', store_id).maybeSingle();

    let lastError: string | null = null;
    for (const cfg of candidates) {
      const p = cfg.provider as ProviderName;
      try {
        if (!isProviderConfigured(p)) { lastError = `${p}: missing credentials`; continue; }
        const pickup = (cfg.pickup_address as DeliveryAddress | null) ?? deriveFromStore(store);
        if (!pickup) { lastError = `${p}: pickup address not configured`; continue; }

        const adapter = getAdapter(p);
        const result = await adapter.createOrder({
          pickup, dropoff, service_type: cfg.service_type,
          quote_id, order_value_cents,
          external_reference: order_id ?? `manual-${Date.now()}`,
        });

        // Persiste delivery_job
        const { data: job, error: jobErr } = await supabase.from('delivery_jobs').insert({
          order_id: order_id ?? null,
          store_id,
          provider: p,
          status: result.status === 'failed' ? 'failed' : 'requested',
          provider_order_id: result.order_id,
          fee_cents: result.fee_cents,
          eta_minutes: result.eta_minutes ?? null,
          driver_name: result.driver_name ?? null,
          driver_phone: result.driver_phone ?? null,
          tracking_url: result.tracking_url ?? null,
          pickup_address: pickup,
          dropoff_address: dropoff,
          raw_order: result.raw,
          requested_at: new Date().toISOString(),
        }).select('id').single();

        if (jobErr) {
          console.error('failed to persist job', jobErr);
          lastError = `${p}: db insert failed`;
          continue;
        }

        if (order_id) {
          await supabase.from('pdv_orders').update({
            delivery_by: p,
            delivery_provider: p,
            delivery_tracking_url: result.tracking_url ?? null,
            delivery_job_id: job!.id,
            delivery_fee: ((result.fee_cents ?? 0) / 100).toFixed(2),
          }).eq('id', order_id);
        }

        return json({ ok: true, job_id: job!.id, provider: p, result });
      } catch (e) {
        const msg = `${p}: ${String(e?.message ?? e)}`;
        console.error('[dispatch] adapter error', msg);
        lastError = msg;
      }
    }

    return json({ error: 'all providers failed', last_error: lastError }, 502);
  } catch (e) {
    console.error('[delivery-dispatch] error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function deriveFromStore(store: { name?: string; address?: unknown } | null): DeliveryAddress | null {
  if (!store?.address) return null;
  const a = store.address as Record<string, unknown>;
  return {
    street: String(a.street ?? a.logradouro ?? ''),
    number: a.number ? String(a.number) : undefined,
    neighborhood: a.neighborhood ? String(a.neighborhood) : undefined,
    city: String(a.city ?? a.cidade ?? 'Brasília'),
    state: String(a.state ?? a.uf ?? 'DF'),
    postal_code: String(a.postal_code ?? a.cep ?? ''),
    country: 'BR',
    latitude: typeof a.latitude === 'number' ? a.latitude : undefined,
    longitude: typeof a.longitude === 'number' ? a.longitude : undefined,
    contact_name: store.name,
  };
}
