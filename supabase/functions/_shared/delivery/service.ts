// Núcleo compartilhado de entregas: cotação e despacho de corrida por loja.
// Usado pelas edge functions delivery-quote, delivery-dispatch,
// ecommerce-checkout e mercadopago-webhook — evita hop HTTP entre functions.
import { getAdapter, isProviderConfigured, type ProviderName } from './factory.ts';
import type { CreateOrderResult, DeliveryAddress, QuoteResult } from './types.ts';

// Cliente supabase-js tipado de forma frouxa: cada function cria o seu.
type Db = {
  from: (table: string) => any;
};

export type ProviderConfigRow = {
  provider: ProviderName;
  priority: number;
  pickup_address: DeliveryAddress | null;
  service_type: string;
};

export type QuoteEntry = QuoteResult | { provider: ProviderName; error: string };

export type QuoteStoreResult = {
  quotes: QuoteEntry[];
  best: QuoteResult | null;
};

export type DispatchArgs = {
  store_id: string;
  dropoff: DeliveryAddress;
  order_id?: string | null;
  provider?: ProviderName;
  quote_id?: string;
  order_value_cents?: number;
  schedule_at?: string;
  /** Sobrescreve pdv_orders.delivery_fee com o custo do provedor.
   *  Falso quando o frete já foi cobrado do cliente no checkout. */
  update_order_fee?: boolean;
};

export type DispatchResult =
  | { ok: true; job_id: string; provider: ProviderName; result: CreateOrderResult }
  | { ok: false; error: string; last_error: string | null };

export async function loadProviderConfigs(
  db: Db,
  storeId: string,
  provider?: ProviderName,
): Promise<ProviderConfigRow[]> {
  const { data } = await db
    .from('delivery_provider_config')
    .select('provider, priority, pickup_address, service_type')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  const configs = (data ?? []) as ProviderConfigRow[];
  return provider ? configs.filter((c) => c.provider === provider) : configs;
}

export function deriveFromStore(
  store: { name?: string; address?: unknown } | null,
): DeliveryAddress | null {
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

async function resolvePickup(
  db: Db,
  storeId: string,
  cfg: ProviderConfigRow,
): Promise<DeliveryAddress | null> {
  if (cfg.pickup_address) return cfg.pickup_address;
  const { data: store } = await db
    .from('stores')
    .select('name, address')
    .eq('id', storeId)
    .maybeSingle();
  return deriveFromStore(store);
}

/** Cota o frete em todos os provedores ativos da loja e devolve o mais barato. */
export async function quoteStore(
  db: Db,
  args: {
    store_id: string;
    dropoff: DeliveryAddress;
    order_value_cents?: number;
    provider?: ProviderName;
    schedule_at?: string;
  },
): Promise<QuoteStoreResult> {
  const configs = await loadProviderConfigs(db, args.store_id, args.provider);
  const quotes: QuoteEntry[] = [];

  for (const cfg of configs) {
    const provider = cfg.provider;
    try {
      if (!isProviderConfigured(provider)) {
        quotes.push({ provider, error: 'provider credentials missing' });
        continue;
      }
      const pickup = await resolvePickup(db, args.store_id, cfg);
      if (!pickup) {
        quotes.push({ provider, error: 'pickup address not configured' });
        continue;
      }
      const quote = await getAdapter(provider).quote({
        pickup,
        dropoff: args.dropoff,
        service_type: cfg.service_type,
        order_value_cents: args.order_value_cents,
        schedule_at: args.schedule_at,
      });
      quotes.push(quote);
    } catch (e) {
      quotes.push({ provider, error: String((e as Error)?.message ?? e) });
    }
  }

  const valid = quotes.filter((q): q is QuoteResult => !('error' in q));
  const best = valid.length > 0 ? [...valid].sort((a, b) => a.fee_cents - b.fee_cents)[0] : null;
  return { quotes, best };
}

/**
 * Solicita a corrida no primeiro provedor que responder e registra em
 * delivery_jobs. Percorre os provedores por prioridade em caso de falha.
 */
export async function dispatchDelivery(db: Db, args: DispatchArgs): Promise<DispatchResult> {
  const configs = await loadProviderConfigs(db, args.store_id, args.provider);
  if (configs.length === 0) {
    return { ok: false, error: 'no active providers', last_error: null };
  }

  let lastError: string | null = null;

  for (const cfg of configs) {
    const provider = cfg.provider;
    try {
      if (!isProviderConfigured(provider)) {
        lastError = `${provider}: missing credentials`;
        continue;
      }
      const pickup = await resolvePickup(db, args.store_id, cfg);
      if (!pickup) {
        lastError = `${provider}: pickup address not configured`;
        continue;
      }

      const result = await getAdapter(provider).createOrder({
        pickup,
        dropoff: args.dropoff,
        service_type: cfg.service_type,
        quote_id: args.quote_id,
        order_value_cents: args.order_value_cents,
        schedule_at: args.schedule_at,
        external_reference: args.order_id ?? `manual-${Date.now()}`,
      });

      const { data: job, error: jobErr } = await db
        .from('delivery_jobs')
        .insert({
          order_id: args.order_id ?? null,
          store_id: args.store_id,
          provider,
          status: result.status === 'failed' ? 'failed' : 'requested',
          provider_order_id: result.order_id,
          provider_quote_id: args.quote_id ?? null,
          fee_cents: result.fee_cents,
          eta_minutes: result.eta_minutes ?? null,
          driver_name: result.driver_name ?? null,
          driver_phone: result.driver_phone ?? null,
          tracking_url: result.tracking_url ?? null,
          pickup_address: pickup,
          dropoff_address: args.dropoff,
          raw_order: result.raw,
          requested_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (jobErr || !job) {
        console.error('[delivery] failed to persist job', jobErr);
        lastError = `${provider}: db insert failed`;
        continue;
      }

      if (args.order_id) {
        const patch: Record<string, unknown> = {
          delivery_by: provider,
          delivery_provider: provider,
          delivery_tracking_url: result.tracking_url ?? null,
          delivery_job_id: job.id,
        };
        if (args.update_order_fee !== false) {
          patch.delivery_fee = ((result.fee_cents ?? 0) / 100).toFixed(2);
        }
        if (args.schedule_at) patch.expected_delivery_at = args.schedule_at;
        await db.from('pdv_orders').update(patch).eq('id', args.order_id);
      }

      return { ok: true, job_id: job.id, provider, result };
    } catch (e) {
      lastError = `${provider}: ${String((e as Error)?.message ?? e)}`;
      console.error('[delivery] adapter error', lastError);
    }
  }

  return { ok: false, error: 'all providers failed', last_error: lastError };
}
