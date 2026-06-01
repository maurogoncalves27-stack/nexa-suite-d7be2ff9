// delivery-quote — cotação de frete pelos provedores ativos da loja.
// Body: { store_id: uuid, dropoff: DeliveryAddress, order_value_cents?: number }
// Resp: { quotes: QuoteResult[], best: QuoteResult }
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
    const { store_id, dropoff, order_value_cents } = body as {
      store_id?: string;
      dropoff?: DeliveryAddress;
      order_value_cents?: number;
    };

    if (!store_id || !dropoff) {
      return new Response(JSON.stringify({ error: 'store_id and dropoff required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: configs } = await supabase
      .from('delivery_provider_config')
      .select('provider, priority, pickup_address, service_type')
      .eq('store_id', store_id)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ error: 'no active delivery providers for this store' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: store } = await supabase.from('stores').select('name, address').eq('id', store_id).maybeSingle();

    const quotes = [];
    for (const cfg of configs) {
      const provider = cfg.provider as ProviderName;
      try {
        const pickup = (cfg.pickup_address as DeliveryAddress | null) ?? deriveFromStore(store);
        if (!pickup) {
          quotes.push({ provider, error: 'pickup address not configured' });
          continue;
        }
        if (!isProviderConfigured(provider)) {
          quotes.push({ provider, error: 'provider credentials missing' });
          continue;
        }
        const adapter = getAdapter(provider);
        const q = await adapter.quote({ pickup, dropoff, service_type: cfg.service_type, order_value_cents });
        quotes.push(q);
      } catch (e) {
        quotes.push({ provider, error: String(e?.message ?? e) });
      }
    }

    const valid = quotes.filter((q: any) => !q.error);
    const best = valid.length > 0
      ? valid.sort((a: any, b: any) => a.fee_cents - b.fee_cents)[0]
      : null;

    return new Response(JSON.stringify({ quotes, best }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[delivery-quote] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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
