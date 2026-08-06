// delivery-quote — cotação de frete pelos provedores ativos da loja.
// Body: { store_id: uuid, dropoff: DeliveryAddress, order_value_cents?: number }
// Resp: { quotes: QuoteResult[], best: QuoteResult }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { quoteStore } from '../_shared/delivery/service.ts';
import type { DeliveryAddress } from '../_shared/delivery/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { store_id, dropoff, order_value_cents, schedule_at } = body as {
      store_id?: string;
      dropoff?: DeliveryAddress;
      order_value_cents?: number;
      schedule_at?: string;
    };

    if (!store_id || !dropoff) {
      return json({ error: 'store_id and dropoff required' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { quotes, best } = await quoteStore(supabase, {
      store_id,
      dropoff,
      order_value_cents,
      schedule_at,
    });

    if (quotes.length === 0) {
      return json({ error: 'no active delivery providers for this store' }, 404);
    }

    return json({ quotes, best });
  } catch (e) {
    console.error('[delivery-quote] error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
