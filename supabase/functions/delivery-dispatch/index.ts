// delivery-dispatch — solicita corrida no provedor (primário ou específico).
// Body: { order_id?: uuid, store_id: uuid, provider?: 'lalamove'|'uber_direct'|'mock',
//         dropoff: DeliveryAddress, quote_id?: string, order_value_cents?: number,
//         schedule_at?: ISO }
// Cria delivery_jobs e atualiza pdv_orders (se order_id).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatchDelivery } from '../_shared/delivery/service.ts';
import type { ProviderName } from '../_shared/delivery/factory.ts';
import type { DeliveryAddress } from '../_shared/delivery/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { order_id, store_id, provider, dropoff, quote_id, order_value_cents, schedule_at } =
      body as {
        order_id?: string;
        store_id?: string;
        provider?: ProviderName;
        dropoff?: DeliveryAddress;
        quote_id?: string;
        order_value_cents?: number;
        schedule_at?: string;
      };

    if (!store_id || !dropoff) {
      return json({ error: 'store_id and dropoff required' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const result = await dispatchDelivery(supabase, {
      order_id,
      store_id,
      provider,
      dropoff,
      quote_id,
      order_value_cents,
      schedule_at,
    });

    if (!result.ok) {
      const status = result.error === 'no active providers' ? 404 : 502;
      return json({ error: result.error, last_error: result.last_error }, status);
    }

    return json(result);
  } catch (e) {
    console.error('[delivery-dispatch] error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
