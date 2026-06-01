// UberDirectAdapter — STUB. Requer UBER_DIRECT_CLIENT_ID / _SECRET / _CUSTOMER_ID.
// Docs: https://developer.uber.com/docs/deliveries
// Implementação real na Fase 2.
import type {
  DeliveryAdapter,
  QuoteRequest,
  QuoteResult,
  CreateOrderRequest,
  CreateOrderResult,
} from './types.ts';

const CLIENT_ID = Deno.env.get('UBER_DIRECT_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('UBER_DIRECT_CLIENT_SECRET') || '';
const CUSTOMER_ID = Deno.env.get('UBER_DIRECT_CUSTOMER_ID') || '';

function ensureCreds() {
  if (!CLIENT_ID || !CLIENT_SECRET || !CUSTOMER_ID) {
    throw new Error('Uber Direct credentials not configured');
  }
}

export const uberDirectAdapter: DeliveryAdapter = {
  provider: 'uber_direct',

  async quote(_req: QuoteRequest): Promise<QuoteResult> {
    ensureCreds();
    // TODO Fase 2: OAuth2 client_credentials + POST /v1/customers/{id}/delivery_quotes
    throw new Error('Uber Direct adapter not yet implemented (Fase 2)');
  },

  async createOrder(_req: CreateOrderRequest): Promise<CreateOrderResult> {
    ensureCreds();
    // TODO Fase 2: POST /v1/customers/{id}/deliveries
    throw new Error('Uber Direct adapter not yet implemented (Fase 2)');
  },

  async cancel(_providerOrderId: string) {
    ensureCreds();
    // TODO Fase 2: POST /v1/customers/{id}/deliveries/{id}/cancel
    throw new Error('Uber Direct adapter not yet implemented (Fase 2)');
  },
};

export const uberDirectMeta = { configured: !!(CLIENT_ID && CLIENT_SECRET && CUSTOMER_ID) };
